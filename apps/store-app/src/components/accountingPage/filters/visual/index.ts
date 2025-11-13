/**
 * Visual Filter System
 * 
 * Provides consistent styling for all accounting filters without changing logic.
 * Simply wrap your existing filters with these components.
 * 
 * @example Basic usage
 * ```tsx
 * import { FilterContainer, FilterSearchBox, FilterSelect, FilterGrid } from './visual';
 * 
 * <FilterContainer title="My Filters" onClear={handleClear}>
 *   <FilterGrid columns={4}>
 *     <FilterSearchBox value={search} onChange={setSearch} />
 *     <FilterSelect value={status} onChange={setStatus} options={statusOptions} />
 *   </FilterGrid>
 * </FilterContainer>
 * ```
 */

export { FilterContainer } from './FilterContainer';
export {
  FilterSearchBox,
  FilterSelect,
  FilterDateInput,
  FilterDateRange,
  FilterButtonGroup,
  FilterGrid,
  FilterSection,
  FilterBadge,
} from './FilterInputs';

// Default export with all components
export { default as FilterInputs } from './FilterInputs';
