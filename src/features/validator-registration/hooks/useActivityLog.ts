import { useRef, useState } from "react";
import { ActivityEvent, ActivityLevel } from "../model/types";

export function useActivityLog(maxEntries = 12) {
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);
  const activityIdRef = useRef(0);

  const appendActivity = (level: ActivityLevel, message: string) => {
    activityIdRef.current += 1;

    setActivityLog((current) => {
      const nextEntry: ActivityEvent = {
        id: activityIdRef.current,
        level,
        message,
      };

      const withoutDuplicates = current.filter(
        (entry) => !(entry.level === level && entry.message === message),
      );

      return [nextEntry, ...withoutDuplicates].slice(0, maxEntries);
    });
  };

  const clearActivityLog = () => {
    setActivityLog([]);
    activityIdRef.current = 0;
  };

  return {
    activityLog,
    appendActivity,
    clearActivityLog,
  };
}
