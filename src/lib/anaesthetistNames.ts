import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { stripDoctorTitle } from '@/lib/names';
import type { Anaesthetist, AnaesthetistPracticeName } from '@/types';

// Each anaesthetist has one shared record (canonical full_name), and each
// practice can keep its own display name for them. Booking screens look the
// name up by the booking's practice, so a surgeon shared between practices
// sees each practice's own name on that practice's bookings; settings screens
// use the viewer's practice. With no practice name, the canonical name is used.
export type PracticeNames = Map<string, string>;

const nameKey = (practiceId: string, anaesthetistId: string) => `${practiceId}:${anaesthetistId}`;

type NameRow = Pick<AnaesthetistPracticeName, 'anaesthetist_id' | 'practice_id' | 'display_name'>;

// One request per set of practices, shared by every component that asks
// (e.g. each BookingCard on the dashboard); reload() refetches.
const cache = new Map<string, Promise<NameRow[]>>();

function fetchNames(idsKey: string, fresh: boolean): Promise<NameRow[]> {
  if (fresh) cache.delete(idsKey);
  let p = cache.get(idsKey);
  if (!p) {
    p = Promise.resolve(
      supabase
        .from('anaesthetist_practice_names')
        .select('anaesthetist_id, practice_id, display_name')
        .in('practice_id', idsKey.split(',')),
    ).then(({ data, error }) => {
      if (error) cache.delete(idsKey); // don't keep a failed lookup
      return (data || []) as NameRow[];
    });
    cache.set(idsKey, p);
  }
  return p;
}

export function usePracticeNames(practiceIds: (string | null | undefined)[]) {
  const ids = [...new Set(practiceIds.filter((p): p is string => !!p))].sort();
  const idsKey = ids.join(',');
  const [names, setNames] = useState<PracticeNames>(new Map());

  const load = useCallback(async (fresh: boolean) => {
    if (!idsKey) { setNames(new Map()); return; }
    const rows = await fetchNames(idsKey, fresh);
    setNames(new Map(rows.map((r) => [nameKey(r.practice_id, r.anaesthetist_id), r.display_name])));
  }, [idsKey]);

  useEffect(() => { load(false); }, [load]);

  const reload = useCallback(() => {
    cache.clear(); // names changed: every screen should refetch
    return load(true);
  }, [load]);

  return { names, reload };
}

// Name without the "Dr" prefix; callers add it, as everywhere else in the app.
export function anaesthetistName(
  names: PracticeNames,
  anaesthetist: Pick<Anaesthetist, 'id' | 'full_name'> | null | undefined,
  practiceId: string | null | undefined,
): string {
  if (!anaesthetist) return 'Unknown';
  const own = practiceId ? names.get(nameKey(practiceId, anaesthetist.id)) : undefined;
  return stripDoctorTitle(own ?? anaesthetist.full_name);
}

// The practice's own saved name, if any (for the "Edit clinic name" dialog).
export function practiceNameFor(names: PracticeNames, anaesthetistId: string, practiceId: string | null | undefined) {
  return practiceId ? names.get(nameKey(practiceId, anaesthetistId)) : undefined;
}
