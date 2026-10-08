import { createClient } from 'npm:@supabase/supabase-js@2';

function toWhatsAppAddress(phone: string): string {
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}

export function stripWhatsAppPrefix(phone: string): string {
  return phone.replace(/^whatsapp:/, '');
}

// Once a message type has a Meta-approved Content Template, pass `template` with
// its Twilio ContentSid and variables — until then, freeform `body` works against
// the WhatsApp sandbox and within a 24h customer-service session.
export async function sendWhatsApp(
  to: string,
  body: string,
  template?: { contentSid: string; variables: Record<string, string> },
): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio WhatsApp credentials not configured');
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const formData = new URLSearchParams();
  formData.append('To', toWhatsAppAddress(to));
  formData.append('From', toWhatsAppAddress(fromNumber));
  if (template) {
    formData.append('ContentSid', template.contentSid);
    formData.append('ContentVariables', JSON.stringify(template.variables));
  } else {
    formData.append('Body', body);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Twilio WhatsApp error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Twilio WhatsApp fetch error:', err);
    return false;
  }
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${ampm}`;
}

export function anaesthesiaLabel(pref: string): string {
  switch (pref) {
    case 'up_to_anaesthetist': return 'Up to anaesthetist';
    case 'GA': return 'GA';
    case 'regional': return 'Regional';
    case 'sedation': return 'Sedation';
    default: return pref;
  }
}

// booking must be fetched with surgeon and practice (with its admin) joined:
//   surgeon:users!bookings_surgeon_id_fkey(*),
//   practice:practices!bookings_practice_id_fkey(*, admin:users!practices_admin_user_id_fkey(*))
export function buildCaseRequestBody(booking: any, windowMinutes: number): string {
  const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(' or ');
  const admin = booking.practice?.admin;

  return [
    'You have a case request:',
    '',
    `Patient: ${booking.patient_initials}, ${booking.patient_age} yrs`,
    `Surgery: ${booking.procedure}`,
    `Surgeon: Dr ${booking.surgeon?.full_name || 'Unknown'}`,
    `Date: ${formatDate(booking.surgery_date)}`,
    `Time: ${formatTime(booking.surgery_time)}`,
    `Duration: ${booking.duration_hours} hrs`,
    `Hospital/Clinic: ${booking.hospital_clinic || 'Unknown'}`,
    `Location: ${booking.ot_location}`,
    `Anaesthesia: ${anaesPrefs}`,
    `Booking Clinic: ${booking.practice?.name || 'Unknown'}`,
    `Name: ${admin?.full_name || 'Unknown'}`,
    `WhatsApp Number: ${admin?.phone || 'Unknown'}`,
    '',
    'Reply 1 to ACCEPT',
    'Reply 2 to DECLINE',
    '',
    `Reply within ${windowMinutes} minutes.`,
  ].join('\n');
}

// Mirrors buildCaseRequestBody but with rescheduled framing. The booking row's
// surgery_date/time/hospital_clinic/ot_location already hold the NEW values by
// the time this runs (the client updates the booking before starting the cascade).
export function buildRescheduleRequestBody(booking: any, windowMinutes: number): string {
  const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(' or ');
  const admin = booking.practice?.admin;

  // Original (pre-reschedule) schedule; fall back to current if not captured.
  const oldDate = formatDate(booking.previous_surgery_date || booking.surgery_date);
  const oldTime = formatTime(booking.previous_surgery_time || booking.surgery_time);
  const oldHospital = booking.previous_hospital_clinic || booking.hospital_clinic || 'Unknown';
  const oldLocation = booking.previous_ot_location || booking.ot_location;

  return [
    'This case has been RESCHEDULED.',
    '',
    `Patient: ${booking.patient_initials}, ${booking.patient_age} yrs`,
    `Surgery: ${booking.procedure}`,
    `Surgeon: Dr ${booking.surgeon?.full_name || 'Unknown'}`,
    `Date: ${oldDate}`,
    `Time: ${oldTime}`,
    `Hospital/Clinic: ${oldHospital}`,
    `Location: ${oldLocation}`,
    '',
    'Rescheduled to:',
    `Date: ${formatDate(booking.surgery_date)}`,
    `Time: ${formatTime(booking.surgery_time)}`,
    `Hospital/Clinic: ${booking.hospital_clinic || 'Unknown'}`,
    `Location: ${booking.ot_location}`,
    '',
    `Duration: ${booking.duration_hours} hrs`,
    `Anaesthesia: ${anaesPrefs}`,
    `Booking Clinic: ${booking.practice?.name || 'Unknown'}`,
    `Name: ${admin?.full_name || 'Unknown'}`,
    `WhatsApp Number: ${admin?.phone || 'Unknown'}`,
    '',
    'Reply 1 to ACCEPT',
    'Reply 2 to DECLINE',
    '',
    `Reply within ${windowMinutes} minutes.`,
  ].join('\n');
}

// Validates an inbound Twilio webhook request per Twilio's signing scheme:
// HMAC-SHA1(authToken, url + sorted(key+value for each param)), base64-encoded,
// compared against the X-Twilio-Signature header. `url` must be the exact
// public URL Twilio was configured to POST to (no query string mismatch,
// no trailing-slash mismatch), since the signature covers it byte-for-byte.
export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string,
): Promise<boolean> {
  if (!authToken || !signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const bytes = new Uint8Array(sigBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const computed = btoa(binary);

  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}
