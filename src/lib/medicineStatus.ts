export type MedicineStatus = "active" | "archived";

export interface MedicineStatusFields {
  status?: MedicineStatus;
  endedAt?: string;
}

/** Legacy medicines have no status and must remain active after the update. */
export const isMedicineActive = (medicine: MedicineStatusFields): boolean => {
  return medicine.status !== "archived";
};

export const getActiveMedicines = <T extends MedicineStatusFields>(medicines: T[]): T[] => {
  return medicines.filter(isMedicineActive);
};

export const getArchivedMedicines = <T extends MedicineStatusFields>(medicines: T[]): T[] => {
  return medicines.filter((medicine) => medicine.status === "archived");
};
