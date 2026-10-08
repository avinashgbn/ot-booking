// Fires the cascade-engine 'start' action for a booking. Best-effort: even if
// this fails (network blip, cold start, etc.), the server-side stalled-step
// sweep in cascade-engine's checkExpirations picks up any never-notified
// pending cascade_steps within ~90s and retries automatically, so a failure
// here delays the first WhatsApp message rather than dead-ending the case.
// Callers should still surface the returned success flag to the user so they
// know the request didn't get an immediate ack.
export async function startCascadeEngine(bookingId: string): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cascade-engine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ bookingId, action: 'start' }),
    });
    if (!response.ok) {
      console.error('cascade-engine start returned', response.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('cascade-engine start request failed', err);
    return false;
  }
}
