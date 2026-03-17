import { useMemo, useState } from "react";
import {
  ALLOWED_OPERATOR_COUNTS,
  DEFAULT_OPERATOR_INPUTS,
  validateOperatorInputs,
} from "../model/operators";

export function useOperatorInputs() {
  const [operatorInputs, setOperatorInputs] = useState<string[]>([
    ...DEFAULT_OPERATOR_INPUTS,
  ]);

  const operatorValidation = useMemo(
    () => validateOperatorInputs(operatorInputs),
    [operatorInputs],
  );

  const selectedOperatorIds = operatorValidation.parsedIds;
  const duplicateOperatorIds = useMemo(
    () => new Set(operatorValidation.duplicateIds),
    [operatorValidation.duplicateIds],
  );

  const updateOperatorInput = (index: number, value: string) => {
    setOperatorInputs((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  const setOperatorCount = (count: number) => {
    if (
      !ALLOWED_OPERATOR_COUNTS.includes(
        count as (typeof ALLOWED_OPERATOR_COUNTS)[number],
      )
    ) {
      return;
    }

    setOperatorInputs((current) => {
      if (count === current.length) {
        return current;
      }

      if (count < current.length) {
        return current.slice(0, count);
      }

      return [...current, ...Array.from({ length: count - current.length }, () => "")];
    });
  };

  const resetOperatorInputs = () => {
    setOperatorInputs([...DEFAULT_OPERATOR_INPUTS]);
  };

  return {
    operatorInputs,
    operatorValidation,
    selectedOperatorIds,
    duplicateOperatorIds,
    updateOperatorInput,
    setOperatorCount,
    resetOperatorInputs,
  };
}
