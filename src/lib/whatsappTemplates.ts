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
    variableCount: 18,
    description: 'Sent to anaesthetists when a confirmed case is rescheduled. Starts a fresh cascade (previously-confirmed anaesthetist ranked first) and shows previous -> new for date/time/hospital/location. Used for both sequential and simultaneous modes.',
    envVar: 'TWILIO_TEMPLATE_SID_RESCHEDULE_REQUEST',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Patient age',
      '{{3}}': 'Procedure',
      '{{4}}': 'Surgeon name',
      '{{5}}': 'Original case date',
      '{{6}}': 'Original case time',
      '{{7}}': 'Original Hospital/Clinic',
      '{{8}}': 'Original OT location',
      '{{9}}': 'New case date',
      '{{10}}': 'New case time',
      '{{11}}': 'New Hospital/Clinic',
      '{{12}}': 'New OT location',
      '{{13}}': 'Duration (hrs)',
      '{{14}}': 'Anaesthesia type',
      '{{15}}': 'Practice name',
      '{{16}}': 'Secretary name',
      '{{17}}': 'Secretary WhatsApp number',
      '{{18}}': 'Timeout window (5 or 8 mins)',
    },
    body: `This case has been RESCHEDULED.

Patient: {{1}}, {{2}} yrs
Surgery: {{3}}
Surgeon: {{4}}
Date: {{5}}
Time: {{6}}
Hospital/Clinic: {{7}}
Location: {{8}}

Rescheduled to:
Date: {{9}}
Time: {{10}}
Hospital/Clinic: {{11}}
Location: {{12}}

Duration: {{13}} hrs
Anaesthesia: {{14}}
Booking Clinic: {{15}}
Contact: {{16}}
WhatsApp: {{17}}

Reply *1* to ACCEPT
Reply *2* to DECLINE
Reply within {{18}} minutes.`,
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
    variableCount: 5,
    description: 'Sent to anaesthetist if cancellation not acknowledged within 30 mins.',
    envVar: 'TWILIO_TEMPLATE_SID_CANCELLATION_REMINDER',
    variables: {
      '{{1}}': 'Procedure',
      '{{2}}': 'Case date',
      '{{3}}': 'Case time',
      '{{4}}': 'Hospital/Clinic',
      '{{5}}': 'Secretary WhatsApp number',
    },
    body: `⚠️ REMINDER: You have not acknowledged the cancellation of the following case:

Surgery: {{1}}
Date: {{2}}
Time: {{3}}
Hospital/Clinic: {{4}}

Please reply *1* to confirm you have received this notice.

For queries contact {{5}}.`,
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
    variableCount: 6,
    description: 'Nudge to the currently-notified anaesthetist before their cascade response window closes. Not sent today — needs wiring in cascade-engine.',
    envVar: 'TWILIO_TEMPLATE_SID_CASCADE_TIMEOUT_REMINDER',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Procedure',
      '{{3}}': 'Case date',
      '{{4}}': 'Case time',
      '{{5}}': 'Hospital/Clinic',
      '{{6}}': 'Minutes remaining',
    },
    body: `Reminder — your response window is closing for the following case:

Patient: {{1}}
Surgery: {{2}}
Date: {{3}}
Time: {{4}}
Hospital/Clinic: {{5}}

Closes in {{6}} minutes. Reply *1* to ACCEPT or *2* to DECLINE.`,
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

  release_filled: {
    name: 'ot_anaesthetist_release_filled',
    category: 'UTILITY',
    variableCount: 6,
    description: 'Sent to other pending anaesthetists (simultaneous mode) once one accepts. Mirrors the freeform release message in whatsapp-webhook.',
    envVar: 'TWILIO_TEMPLATE_SID_RELEASE_FILLED',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Procedure',
      '{{4}}': 'Case date',
      '{{5}}': 'Case time',
      '{{6}}': 'Hospital/Clinic',
    },
    body: `Hi Dr {{1}},

This case has been filled by another anaesthetist:

Patient: {{2}}
Surgery: {{3}}
Date: {{4}}
Time: {{5}}
Hospital/Clinic: {{6}}

Thank you for your availability.`,
  },

  release_cancelled: {
    name: 'ot_anaesthetist_release_cancelled',
    category: 'UTILITY',
    variableCount: 6,
    description: 'Sent to still-pending anaesthetists when a case is cancelled before anyone accepted. Mirrors the release loop in send-whatsapp cancellation.',
    envVar: 'TWILIO_TEMPLATE_SID_RELEASE_CANCELLED',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Procedure',
      '{{4}}': 'Case date',
      '{{5}}': 'Case time',
      '{{6}}': 'Hospital/Clinic',
    },
    body: `Hi Dr {{1}},

This case has been cancelled:

Patient: {{2}}
Surgery: {{3}}
Date: {{4}}
Time: {{5}}
Hospital/Clinic: {{6}}

Thank you for your availability.`,
  },

  invalid_reply: {
    name: 'ot_anaesthetist_invalid_reply',
    category: 'UTILITY',
    variableCount: 5,
    description: 'Sent when an anaesthetist replies with anything other than 1 or 2 during an open window. Mirrors sendInvalidReplyWhatsApp in whatsapp-webhook.',
    envVar: 'TWILIO_TEMPLATE_SID_INVALID_REPLY',
    variables: {
      '{{1}}': 'Patient name/initials',
      '{{2}}': 'Procedure',
      '{{3}}': 'Case date',
      '{{4}}': 'Case time',
      '{{5}}': 'Hospital/Clinic',
    },
    body: `Sorry, we did not recognise your reply.

Reply *1* to ACCEPT or *2* to DECLINE the following case:

Patient: {{1}}
Surgery: {{2}}
Date: {{3}}
Time: {{4}}
Hospital/Clinic: {{5}}

You still have time remaining on your window.`,
  },

  cancellation_ack_anaesthetist: {
    name: 'ot_anaesthetist_cancellation_ack',
    category: 'UTILITY',
    variableCount: 5,
    description: 'Reply back to the anaesthetist who acknowledges a cancellation (distinct from the secretary-facing ack). Mirrors the ackBody in whatsapp-webhook.',
    envVar: 'TWILIO_TEMPLATE_SID_CANCELLATION_ACK_ANAESTHETIST',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Procedure',
      '{{3}}': 'Case date',
      '{{4}}': 'Case time',
      '{{5}}': 'Hospital/Clinic',
    },
    body: `Thank you Dr {{1}}. Your cancellation acknowledgement has been recorded for the following case:

Surgery: {{2}}
Date: {{3}}
Time: {{4}}
Hospital/Clinic: {{5}}`,
  },

  unacknowledged_cancellation_alert: {
    name: 'ot_secretary_unacknowledged_cancellation_alert',
    category: 'UTILITY',
    variableCount: 7,
    description: 'Sent to the secretary when a confirmed anaesthetist has not acknowledged a cancellation within 30 min. Mirrors the alertBody in cascade-engine checkExpirations.',
    envVar: 'TWILIO_TEMPLATE_SID_UNACK_CANCELLATION_ALERT',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Procedure',
      '{{4}}': 'Case date',
      '{{5}}': 'Case time',
      '{{6}}': 'Hospital/Clinic',
      '{{7}}': 'Anaesthetist WhatsApp number',
    },
    body: `⚠️ ALERT: Dr {{1}} has not acknowledged the cancellation of the following case:

Patient: {{2}}
Surgery: {{3}}
Date: {{4}}
Time: {{5}}
Hospital/Clinic: {{6}}

Please call them directly: {{7}}`,
  },

  preop_reminder_anaesthetist: {
    name: 'ot_anaesthetist_preop_reminder',
    category: 'UTILITY',
    variableCount: 12,
    description: 'Day-before / morning-of reminder to the confirmed anaesthetist. Not sent today — needs a scheduled job to wire up later.',
    envVar: 'TWILIO_TEMPLATE_SID_PREOP_REMINDER_ANAESTHETIST',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Patient age',
      '{{4}}': 'Procedure',
      '{{5}}': 'Surgeon name',
      '{{6}}': 'Case date',
      '{{7}}': 'Case time',
      '{{8}}': 'Duration (hrs)',
      '{{9}}': 'Hospital/Clinic',
      '{{10}}': 'OT location',
      '{{11}}': 'Anaesthesia type',
      '{{12}}': 'Secretary WhatsApp number',
    },
    body: `Dear Dr {{1}},

Reminder — you have a confirmed case coming up:

Patient: {{2}}, {{3}} yrs
Procedure: {{4}}
Surgeon: {{5}}
Date: {{6}}
Time: {{7}}
Duration: {{8}} hrs
Hospital/Clinic: {{9}}
Location: {{10}}
Anaesthesia: {{11}}

For queries contact {{12}}.`,
  },

  preop_reminder_surgeon: {
    name: 'ot_surgeon_preop_reminder',
    category: 'UTILITY',
    variableCount: 10,
    description: 'Day-before / morning-of reminder to the surgeon. Not sent today — needs a scheduled job to wire up later.',
    envVar: 'TWILIO_TEMPLATE_SID_PREOP_REMINDER_SURGEON',
    variables: {
      '{{1}}': 'Surgeon name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Patient age',
      '{{4}}': 'Procedure',
      '{{5}}': 'Case date',
      '{{6}}': 'Case time',
      '{{7}}': 'Hospital/Clinic',
      '{{8}}': 'OT location',
      '{{9}}': 'Anaesthetist name',
      '{{10}}': 'Secretary WhatsApp number',
    },
    body: `Dear Dr {{1}},

Reminder — your case is coming up:

Patient: {{2}}, {{3}} yrs
Procedure: {{4}}
Date: {{5}}
Time: {{6}}
Hospital/Clinic: {{7}}
Location: {{8}}
Anaesthetist: Dr {{9}}

For queries contact {{10}}.`,
  },

  escalation_practice_admin: {
    name: 'ot_practice_admin_escalation',
    category: 'UTILITY',
    variableCount: 10,
    description: 'Escalates a stalled or exhausted cascade above the secretary to the practice admin. Not sent today.',
    envVar: 'TWILIO_TEMPLATE_SID_ESCALATION_PRACTICE_ADMIN',
    variables: {
      '{{1}}': 'Practice admin name',
      '{{2}}': 'Patient name/initials',
      '{{3}}': 'Patient age',
      '{{4}}': 'Procedure',
      '{{5}}': 'Surgeon name',
      '{{6}}': 'Case date',
      '{{7}}': 'Case time',
      '{{8}}': 'Hospital/Clinic',
      '{{9}}': 'Secretary name',
      '{{10}}': 'Secretary WhatsApp number',
    },
    body: `Dear {{1}},

⚠️ Escalation — a case still has no anaesthetist:

Patient: {{2}}, {{3}} yrs
Procedure: {{4}}
Surgeon: {{5}}
Date: {{6}}
Time: {{7}}
Hospital/Clinic: {{8}}

Handling secretary: {{9}} ({{10}}).
Please review and assist.`,
  },

  booking_updated: {
    name: 'ot_anaesthetist_booking_updated',
    category: 'UTILITY',
    variableCount: 12,
    description: 'Notifies the confirmed anaesthetist when patient/procedure/duration details are corrected (distinct from a date/time/location reschedule). Not sent today.',
    envVar: 'TWILIO_TEMPLATE_SID_BOOKING_UPDATED',
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

Details for your confirmed case have been updated:

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

  invite_reminder: {
    name: 'ot_invite_reminder',
    category: 'UTILITY',
    variableCount: 6,
    description: 'Nudges an unactivated surgeon/secretary invite before the 72h link expires. Not sent today.',
    envVar: 'TWILIO_TEMPLATE_SID_INVITE_REMINDER',
    variables: {
      '{{1}}': 'Recipient name',
      '{{2}}': 'Practice name',
      '{{3}}': 'Role (Surgeon / Secretary)',
      '{{4}}': 'Unique invite link',
      '{{5}}': 'Hours remaining before expiry',
      '{{6}}': 'Practice admin WhatsApp number',
    },
    body: `Dear {{1}},

A reminder that your invite to join {{2}} on the OT Booking Platform (as {{3}}) is still pending.

Activate your account here:
{{4}}

This link expires in {{5}} hours. For queries contact {{6}}.`,
  },

  account_activated: {
    name: 'ot_account_activated',
    category: 'UTILITY',
    variableCount: 3,
    description: 'Welcome confirmation once a surgeon/secretary activates their account. Not sent today.',
    envVar: 'TWILIO_TEMPLATE_SID_ACCOUNT_ACTIVATED',
    variables: {
      '{{1}}': 'Recipient name',
      '{{2}}': 'Practice name',
      '{{3}}': 'Role (Surgeon / Secretary)',
    },
    body: `Welcome, {{1}}!

Your account for {{2}} on the OT Booking Platform is now active. Your role: {{3}}.

You will receive case updates on this number.`,
  },

  anaesthetist_optin: {
    name: 'ot_anaesthetist_optin',
    category: 'UTILITY',
    variableCount: 3,
    description: 'Opt-in / consent request to an anaesthetist before sending case requests. Anaesthetists are contacts (not app users); Meta requires opt-in for business-initiated messaging. NOTE: Meta may reclassify this on submission — confirm category during approval.',
    envVar: 'TWILIO_TEMPLATE_SID_ANAESTHETIST_OPTIN',
    variables: {
      '{{1}}': 'Anaesthetist name',
      '{{2}}': 'Practice/Clinic name',
      '{{3}}': 'Practice admin/secretary WhatsApp number',
    },
    body: `Hi Dr {{1}},

{{2}} would like to send you operating-theatre case requests and updates on WhatsApp.

Reply *YES* to consent. You can opt out any time by replying *STOP*.

Questions? Contact {{3}}.`,
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
