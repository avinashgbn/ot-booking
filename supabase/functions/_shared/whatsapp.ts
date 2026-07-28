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

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}
