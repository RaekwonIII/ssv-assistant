import { useMemo, useState } from "react";
import {
  DEFAULT_OPERATOR_INPUTS,
  MAX_OPERATOR_COUNT,
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

  const addOperatorInput = () => {
    setOperatorInputs((current) => {
      if (current.length >= MAX_OPERATOR_COUNT) {
        return current;
      }

      return [...current, ""];
    });
  };

  const removeOperatorInput = (index: number) => {
    setOperatorInputs((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  return {
    operatorInputs,
    operatorValidation,
    selectedOperatorIds,
    duplicateOperatorIds,
    updateOperatorInput,
    addOperatorInput,
    removeOperatorInput,
  };
}
