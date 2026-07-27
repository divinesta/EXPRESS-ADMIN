import { useState } from "react";

export const useFilters = () => {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const updateFilter = (name: string, value: string) => setFilters((current) => ({ ...current, [name]: value }));
  const resetFilters = () => setFilters({});
  return { filters, updateFilter, resetFilters };
};
