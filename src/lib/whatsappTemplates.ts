// WhatsApp Template Definitions for OT Booking Platform
// Store Content SIDs returned by Twilio after Meta approval as Supabase env vars
// Reference this file in CLAUDE.md for session continuity

export interface WhatsAppTemplate {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  variableCount: number;
  description: string;
  variables: Record<string, string>;
  body: string;
  envVar: string; // Supabase env var name to store the Content SID
}

export const WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplate> = {

  cascade_request: {
    name: 'ot_anaesthetist_cascade_request',
    category: 'UTILITY',
    variableCount: 14,
    description: 'Sent to anaesthetist requesting case coverage. Used for both sequential and simultaneous blast cascade modes.',
    envVar: 'TWILIO_TEMPLATE_SID_CASCADE_REQUEST',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Patient age',
      '{{3}}': 'Procedure',
      '{{4}}': 'Surgeon name',
      '{{5}}': 'Case date',
      '{{6}}': 'Case time',
      '{{7}}': 'Duration (hrs)',
      '{{8}}': 'Hospital/Clinic',
      '{{9}}': 'OT location',
      '{{10}}': 'Anaesthesia type',
      '{{11}}': 'Practice name',
      '{{12}}': 'Secretary name',
      '{{13}}': 'Secretary WhatsApp number',
      '{{14}}': 'Timeout window (5 or 8 mins)',
    },
    body: `Will you be available to support this case?

Patient: {{1}}, {{2}} yrs
Surgery: {{3}}
Surgeon: {{4}}
Date: {{5}}
Time: {{6}}
Duration: {{7}} hrs
Hospital/Clinic: {{8}}
Location: {{9}}
Anaesthesia: {{10}}

Booking Clinic: {{11}}
Contact: {{12}}
WhatsApp: {{13}}

Reply *1* to ACCEPT
Reply *2* to DECLINE
Reply within {{14}} minutes.`,
  },

  reschedule_request: {
    name: 'ot_anaesthetist_reschedule_request',
    category: 'UTILITY',
    variableCount: 14,
    description: 'Sent to anaesthetists when a confirmed case is rescheduled. Starts a fresh cascade (previously-confirmed anaesthetist ranked first) with the new date/time/location. Used for both sequential and simultaneous modes.',
    envVar: 'TWILIO_TEMPLATE_SID_RESCHEDULE_REQUEST',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Patient age',
      '{{3}}': 'Procedure',
      '{{4}}': 'Surgeon name',
      '{{5}}': 'New case date',
      '{{6}}': 'New case time',
      '{{7}}': 'Duration (hrs)',
      '{{8}}': 'New Hospital/Clinic',
      '{{9}}': 'New OT location',
      '{{10}}': 'Anaesthesia type',
      '{{11}}': 'Practice name',
      '{{12}}': 'Secretary name',
      '{{13}}': 'Secretary WhatsApp number',
      '{{14}}': 'Timeout window (5 or 8 mins)',
    },
    body: `🔄 This case has been RESCHEDULED. Will you be available for the new date/time?

Patient: {{1}}, {{2}} yrs
Surgery: {{3}}
Surgeon: {{4}}
New Date: {{5}}
New Time: {{6}}
Duration: {{7}} hrs
Hospital/Clinic: {{8}}
Location: {{9}}
Anaesthesia: {{10}}

Booking Clinic: {{11}}
Contact: {{12}}
WhatsApp: {{13}}

Reply *1* to ACCEPT
Reply *2* to DECLINE
Reply within {{14}} minutes.`,
  },

  confirmation: {
    name: 'ot_anaesthetist_confirmation',
    category: 'UTILITY',
    variableCount: 12,
    description: 'Sent to anaesthetist once they accept the case.',
    envVar: 'TWILIO_TEMPLATE_SID_CONFIRMATION',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Patient age',
      '{{4}}': 'Procedure',
      '{{5}}': 'Surgeon name',
      '{{6}}': 'Hospital/Clinic',
      '{{7}}': 'OT location',
      '{{8}}': 'Case date',
      '{{9}}': 'Case time',
      '{{10}}': 'Duration (hrs)',
      '{{11}}': 'Anaesthesia type',
      '{{12}}': 'Secretary WhatsApp number',
    },
    body: `Dear Dr {{1}},

You are confirmed for the following case:

Patient: {{2}}, {{3}} yrs
Procedure: {{4}}
Surgeon: {{5}}
Hospital/Clinic: {{6}}
Location: {{7}}
Date: {{8}}
Time: {{9}}
Duration: {{10}} hrs
Anaesthesia: {{11}}

Contact {{12}} if you have any queries.`,
  },

  cancellation: {
    name: 'ot_anaesthetist_cancellation',
    category: 'UTILITY',
    variableCount: 13,
    description: 'Sent to anaesthetist when a confirmed case is cancelled. 30-min acknowledgement window — unacknowledged triggers reminder then secretary alert.',
    envVar: 'TWILIO_TEMPLATE_SID_CANCELLATION',
    variables: {
      '{{1}}': 'Case date (alert header)',
      '{{2}}': 'Case time (alert header)',
      '{{3}}': 'Anaesthetist name',
      '{{4}}': 'Patient name/initials',
      '{{5}}': 'Patient age',
      '{{6}}': 'Procedure',
      '{{7}}': 'Surgeon name',
      '{{8}}': 'Case date (body)',
      '{{9}}': 'Case time (body)',
      '{{10}}': 'Hospital/Clinic',
      '{{11}}': 'OT location',
      '{{12}}': 'Cancellation reason',
      '{{13}}': 'Secretary WhatsApp number',
    },
    body: `⚠️ ALERT: Case on {{1}} at {{2}} is CANCELLED

Dear Dr {{3}},

The following confirmed case has been cancelled:

Patient: {{4}}, {{5}} yrs
Procedure: {{6}}
Surgeon: {{7}}
Date: {{8}}
Time: {{9}}
Hospital/Clinic: {{10}}
Location: {{11}}
Reason: {{12}}

We apologise for the inconvenience. For queries contact {{13}}.

Reply *1* to acknowledge this cancellation.`,
  },

  cancellation_reminder: {
    name: 'ot_anaesthetist_cancellation_reminder',
    category: 'UTILITY',
    variableCount: 3,
    description: 'Sent to anaesthetist if cancellation not acknowledged within 30 mins.',
    envVar: 'TWILIO_TEMPLATE_SID_CANCELLATION_REMINDER',
    variables: {
      '{{1}}': 'Case date',
      '{{2}}': 'Case time',
      '{{3}}': 'Secretary WhatsApp number',
    },
    body: `⚠️ REMINDER: You have not acknowledged the cancellation of the case on {{1}} at {{2}}.

Please reply *1* to confirm you have received this notice.

For queries contact {{3}}.`,
  },

  cascade_exhausted: {
    name: 'ot_cascade_exhausted',
    category: 'UTILITY',
    variableCount: 7,
    description: 'Sent to secretary when all anaesthetists on the preference list have declined or not responded.',
    envVar: 'TWILIO_TEMPLATE_SID_CASCADE_EXHAUSTED',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Patient age',
      '{{3}}': 'Procedure',
      '{{4}}': 'Surgeon name',
      '{{5}}': 'Case date',
      '{{6}}': 'Case time',
      '{{7}}': 'Hospital/Clinic',
    },
    body: `⚠️ No anaesthetist available for the following case:

Patient: {{1}}, {{2}} yrs
Procedure: {{3}}
Surgeon: {{4}}
Date: {{5}}
Time: {{6}}
Hospital/Clinic: {{7}}

All anaesthetists on the preference list have been contacted.
Please log in to rebook or contact an anaesthetist directly.`,
  },

  invite: {
    name: 'ot_invite',
    category: 'UTILITY',
    variableCount: 6,
    description: 'Sent to surgeons and secretaries during onboarding. One template covers both roles.',
    envVar: 'TWILIO_TEMPLATE_SID_INVITE',
    variables: {
      '{{1}}': 'Recipient name',
      '{{2}}': 'Practice name',
      '{{3}}': 'Role (Surgeon / Secretary)',
      '{{4}}': 'Unique invite link',
      '{{5}}': 'Link expiry (hrs)',
      '{{6}}': 'Practice admin WhatsApp number',
    },
    body: `Dear {{1}},

You have been invited to join {{2}} on the OT Booking Platform.

Your role: {{3}}

Please click the link below to confirm your details and activate your account:
{{4}}

This link expires in {{5}} hours.

For queries contact {{6}}.`,
  },

  surgeon_notification: {
    name: 'ot_surgeon_notification',
    category: 'UTILITY',
    variableCount: 13,
    description: 'Sent to both surgeon and secretary once anaesthetist is confirmed.',
    envVar: 'TWILIO_TEMPLATE_SID_SURGEON_NOTIFICATION',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Patient age',
      '{{3}}': 'Procedure',
      '{{4}}': 'Surgeon name',
      '{{5}}': 'Case date',
      '{{6}}': 'Case time',
      '{{7}}': 'Duration (hrs)',
      '{{8}}': 'Hospital/Clinic',
      '{{9}}': 'OT location',
      '{{10}}': 'Anaesthesia type',
      '{{11}}': 'Anaesthetist name',
      '{{12}}': 'Anaesthetist WhatsApp number',
      '{{13}}': 'Secretary WhatsApp number',
    },
    body: `✅ Anaesthetist confirmed for your case.

Patient: {{1}}, {{2}} yrs
Procedure: {{3}}
Surgeon: {{4}}
Date: {{5}}
Time: {{6}}
Duration: {{7}} hrs
Hospital/Clinic: {{8}}
Location: {{9}}
Anaesthesia: {{10}}

Anaesthetist: Dr {{11}}
Contact: {{12}}

For queries contact {{13}}.`,
  },

  cascade_timeout_reminder: {
    name: 'ot_cascade_timeout_reminder',
    category: 'UTILITY',
    variableCount: 0,
    description: 'Nudge to anaesthetist before cascade window closes. Body still to be drafted.',
    envVar: 'TWILIO_TEMPLATE_SID_CASCADE_TIMEOUT_REMINDER',
    variables: {},
    body: ``, // TODO: draft this template
  },

  booking_confirmation_secretary: {
    name: 'ot_booking_confirmation_secretary',
    category: 'UTILITY',
    variableCount: 10,
    description: 'Sent to secretary confirming booking was submitted and cascade has been initiated.',
    envVar: 'TWILIO_TEMPLATE_SID_BOOKING_CONFIRMATION',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Patient age',
      '{{3}}': 'Procedure',
      '{{4}}': 'Surgeon name',
      '{{5}}': 'Case date',
      '{{6}}': 'Case time',
      '{{7}}': 'Duration (hrs)',
      '{{8}}': 'Hospital/Clinic',
      '{{9}}': 'OT location',
      '{{10}}': 'Anaesthesia type',
    },
    body: `✅ Booking submitted successfully.

Patient: {{1}}, {{2}} yrs
Procedure: {{3}}
Surgeon: {{4}}
Date: {{5}}
Time: {{6}}
Duration: {{7}} hrs
Hospital/Clinic: {{8}}
Location: {{9}}
Anaesthesia: {{10}}

Contacting anaesthetists now. You will be notified once confirmed.`,
  },

  cancellation_acknowledgement_secretary: {
    name: 'ot_cancellation_acknowledgement_secretary',
    category: 'UTILITY',
    variableCount: 9,
    description: 'Sent to secretary when anaesthetist acknowledges the cancellation.',
    envVar: 'TWILIO_TEMPLATE_SID_CANCELLATION_ACK',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Patient age',
      '{{4}}': 'Procedure',
      '{{5}}': 'Surgeon name',
      '{{6}}': 'Case date',
      '{{7}}': 'Case time',
      '{{8}}': 'Hospital/Clinic',
      '{{9}}': 'OT location',
    },
    body: `✅ Cancellation acknowledged.

Dr {{1}} has confirmed receipt of the cancellation for the following case:

Patient: {{2}}, {{3}} yrs
Procedure: {{4}}
Surgeon: {{5}}
Date: {{6}}
Time: {{7}}
Hospital/Clinic: {{8}}
Location: {{9}}

No further action required.`,
  },

  pin_reset: {
    name: 'ot_pin_reset',
    category: 'UTILITY',
    variableCount: 4,
    description: 'Sent to surgeon or secretary when a PIN reset is requested. Link expires in 24 hrs.',
    envVar: 'TWILIO_TEMPLATE_SID_PIN_RESET',
    variables: {
      '{{1}}': 'Recipient name',
      '{{2}}': 'PIN reset link',
      '{{3}}': 'Link expiry (hrs)',
      '{{4}}': 'Practice admin WhatsApp number',
    },
    body: `Dear {{1}},

A PIN reset has been requested for your OT Booking Platform account.

Click the link below to set a new PIN:
{{2}}

This link expires in {{3}} hours.

If you did not request this, please contact {{4}} immediately.`,
  },

};

// Helper to get template name by key
export const getTemplateName = (key: keyof typeof WHATSAPP_TEMPLATES): string => {
  return WHATSAPP_TEMPLATES[key].name;
};

// Helper to get env var name for Content SID lookup
export const getTemplateEnvVar = (key: keyof typeof WHATSAPP_TEMPLATES): string => {
  return WHATSAPP_TEMPLATES[key].envVar;
};
