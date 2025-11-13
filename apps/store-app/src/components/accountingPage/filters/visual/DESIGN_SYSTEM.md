# Filter Visual Design System

## 🎨 Design Tokens

### Colors

```css
/* Primary Colors */
--filter-primary: #2563eb;        /* Blue 600 */
--filter-primary-light: #dbeafe;  /* Blue 100 */
--filter-primary-dark: #1e40af;   /* Blue 700 */

/* Background Colors */
--filter-bg-header: linear-gradient(to right, #eff6ff, #eef2ff);  /* Blue 50 to Indigo 50 */
--filter-bg-white: #ffffff;
--filter-bg-gray: #f9fafb;        /* Gray 50 */

/* Border Colors */
--filter-border: #e5e7eb;         /* Gray 200 */
--filter-border-hover: #9ca3af;   /* Gray 400 */
--filter-border-focus: #2563eb;   /* Blue 600 */

/* Text Colors */
--filter-text-primary: #111827;   /* Gray 900 */
--filter-text-secondary: #6b7280; /* Gray 600 */
--filter-text-tertiary: #9ca3af;  /* Gray 400 */
```

### Spacing

```css
/* Padding */
--filter-padding-sm: 0.5rem;      /* 8px */
--filter-padding-md: 0.75rem;     /* 12px */
--filter-padding-lg: 1rem;        /* 16px */

/* Gaps */
--filter-gap-sm: 0.5rem;          /* 8px */
--filter-gap-md: 0.75rem;         /* 12px */
--filter-gap-lg: 1rem;            /* 16px */

/* Margins */
--filter-margin-section: 1rem;    /* 16px */
```

### Typography

```css
/* Font Sizes */
--filter-text-xs: 0.75rem;        /* 12px */
--filter-text-sm: 0.875rem;       /* 14px */
--filter-text-base: 1rem;         /* 16px */

/* Font Weights */
--filter-weight-normal: 400;
--filter-weight-medium: 500;
--filter-weight-semibold: 600;
--filter-weight-bold: 700;

/* Line Heights */
--filter-leading-tight: 1.25;
--filter-leading-normal: 1.5;
```

### Borders & Shadows

```css
/* Border Radius */
--filter-radius-sm: 0.375rem;     /* 6px */
--filter-radius-md: 0.5rem;       /* 8px */
--filter-radius-lg: 0.75rem;      /* 12px */

/* Shadows */
--filter-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--filter-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
```

## 📐 Component Specifications

### FilterContainer

```
┌─────────────────────────────────────────────────────────────┐
│ Header (gradient bg-blue-50 to bg-indigo-50)               │
│ ┌────┐                                        ┌──────────┐ │
│ │Icon│ Title                                  │ Actions  │ │
│ └────┘ Item count                             └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Content (bg-white, p-4)                                     │
│                                                             │
│   [Filter inputs arranged in grid]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Specifications:
- Border: 1px solid gray-200
- Border radius: 8px
- Shadow: sm
- Header padding: 12px 16px
- Content padding: 16px
- Header gradient: blue-50 to indigo-50
```

### FilterSearchBox

```
┌─────────────────────────────────────────────────────────┐
│ 🔍  Search text here...                            ✕    │
└─────────────────────────────────────────────────────────┘

Specifications:
- Height: 42px (py-2.5)
- Padding left: 40px (for icon)
- Padding right: 40px (for clear button)
- Border: 1px solid gray-300
- Border radius: 8px
- Icon size: 16px (w-4 h-4)
- Icon color: gray-400
- Focus ring: 2px blue-500
- Hover border: gray-400
```

### FilterSelect

```
Label (text-xs, font-medium, gray-700, mb-1.5)
┌─────────────────────────────────────────────────────────┐
│ Selected option                                      ▼  │
└─────────────────────────────────────────────────────────┘

Specifications:
- Height: 42px (py-2.5)
- Padding: 12px
- Border: 1px solid gray-300
- Border radius: 8px
- Background: white
- Focus ring: 2px blue-500
- Hover border: gray-400
- Label margin bottom: 6px
```

### FilterDateInput

```
Label (text-xs, font-medium, gray-700, mb-1.5)
┌─────────────────────────────────────────────────────────┐
│ 📅  2024-11-13                                          │
└─────────────────────────────────────────────────────────┘

Specifications:
- Height: 42px (py-2.5)
- Padding left: 40px (for icon)
- Border: 1px solid gray-300
- Border radius: 8px
- Icon size: 16px (w-4 h-4)
- Icon color: gray-400
- Focus ring: 2px blue-500
```

### FilterButtonGroup

```
Label (text-xs, font-medium, gray-700, mb-2)

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ All  │ │Today │ │ Week │ │Month │  ← Unselected
└──────┘ └──────┘ └──────┘ └──────┘

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ All  │ │Today │ │ Week │ │Month │  ← Selected (blue)
└──────┘ └──────┘ └──────┘ └──────┘

Specifications:
- Button height: 40px (py-2)
- Button padding: 16px (px-4)
- Border radius: 8px
- Gap: 8px
- Unselected: white bg, gray-300 border, gray-700 text
- Selected: blue-600 bg, white text, shadow-sm
- Hover (unselected): gray-50 bg, gray-400 border
- Hover (selected): blue-700 bg
```

### FilterGrid

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Column 1  │   Column 2  │   Column 3  │   Column 4  │
└─────────────┴─────────────┴─────────────┴─────────────┘

Responsive Breakpoints:
- Mobile (< 768px):    1 column
- Tablet (768-1024px): 2 columns
- Desktop (> 1024px):  4 columns (or configured)

Gap: 16px (gap-4)
```

### FilterSection

```
SECTION TITLE (uppercase, tracking-wider, text-xs, gray-700)
─────────────────────────────────────────────────────────────

[Section content]


Specifications:
- Title font size: 12px (text-xs)
- Title font weight: 600 (semibold)
- Title transform: uppercase
- Title letter spacing: wider
- Title color: gray-700
- Margin bottom: 12px (mb-3)
```

### FilterBadge

```
┌─────────────┐
│ 3 active    │
└─────────────┘

Specifications:
- Padding: 2px 8px (px-2 py-0.5)
- Border radius: 9999px (full)
- Background: blue-100
- Text color: blue-800
- Font size: 12px (text-xs)
- Font weight: 600 (semibold)
```

## 🎯 Visual Hierarchy

### Level 1: Container
- Most prominent
- Gradient header
- Clear boundaries
- Shadow for depth

### Level 2: Sections
- Group related filters
- Uppercase labels
- Subtle separation

### Level 3: Inputs
- Standard height (42px)
- Consistent spacing
- Clear focus states

### Level 4: Labels
- Small, medium weight
- Above inputs
- Gray color

## 🌈 Color Usage

### Primary (Blue)
- Selected states
- Focus rings
- Active buttons
- Primary actions

### Gray Scale
- Borders (gray-200, gray-300)
- Text (gray-600, gray-700, gray-900)
- Backgrounds (gray-50, white)
- Hover states (gray-400)

### Gradient
- Header background only
- Blue-50 to Indigo-50
- Subtle, professional

## 📱 Responsive Behavior

### Mobile (< 768px)
```
┌─────────────────────┐
│ Search              │
├─────────────────────┤
│ Dropdown 1          │
├─────────────────────┤
│ Dropdown 2          │
├─────────────────────┤
│ Date From           │
├─────────────────────┤
│ Date To             │
└─────────────────────┘
```

### Tablet (768px - 1024px)
```
┌───────────┬───────────┐
│ Search    │ Dropdown 1│
├───────────┼───────────┤
│ Dropdown 2│ Date From │
├───────────┼───────────┤
│ Date To   │           │
└───────────┴───────────┘
```

### Desktop (> 1024px)
```
┌──────┬──────┬──────┬──────┐
│Search│Drop 1│Drop 2│Date F│
└──────┴──────┴──────┴──────┘
```

## ✨ Interactive States

### Input States

**Default**
- Border: gray-300
- Background: white
- Text: gray-900

**Hover**
- Border: gray-400
- Cursor: pointer (for selects)

**Focus**
- Border: transparent
- Ring: 2px blue-500
- Outline: none

**Disabled**
- Background: gray-100
- Text: gray-400
- Cursor: not-allowed

**Error** (if needed)
- Border: red-300
- Ring: red-500
- Text: red-600

### Button States

**Default (Unselected)**
- Background: white
- Border: gray-300
- Text: gray-700

**Hover (Unselected)**
- Background: gray-50
- Border: gray-400

**Selected**
- Background: blue-600
- Border: none
- Text: white
- Shadow: sm

**Hover (Selected)**
- Background: blue-700

## 🔤 Typography Scale

```
Header Title:    14px / 600 / gray-900
Item Count:      12px / 400 / gray-600
Section Title:   12px / 600 / gray-700 / uppercase
Input Label:     12px / 500 / gray-700
Input Text:      14px / 400 / gray-900
Button Text:     14px / 500 / white or gray-700
Badge Text:      12px / 600 / blue-800
```

## 📏 Spacing System

```
Component Padding:
- Container header:  12px 16px
- Container content: 16px
- Input:            10px 12px
- Button:           8px 16px
- Badge:            2px 8px

Component Gaps:
- Grid gap:         16px
- Button group gap: 8px
- Section gap:      16px

Component Margins:
- Section bottom:   16px
- Label bottom:     6px
```

## 🎭 Animation & Transitions

```css
/* All interactive elements */
transition: all 150ms ease-in-out;

/* Hover states */
transition-property: background-color, border-color, color;
transition-duration: 150ms;
transition-timing-function: ease-in-out;

/* Focus rings */
transition: box-shadow 150ms ease-in-out;

/* Collapse/Expand */
transition: max-height 300ms ease-in-out;
```

## 🌍 RTL Support

All components support right-to-left languages:

```css
/* Icons flip to right side */
.rtl:left-3  → .rtl:right-3

/* Flex direction reverses */
.rtl:flex-row-reverse

/* Text alignment */
.rtl:text-right

/* Padding adjustments */
.rtl:pl-10 .rtl:pr-4
```

## ♿ Accessibility

### Focus Management
- Visible focus rings (2px blue-500)
- Keyboard navigation support
- Tab order follows visual order

### Color Contrast
- Text: 4.5:1 minimum ratio
- Interactive elements: 3:1 minimum
- WCAG AA compliant

### Screen Readers
- Semantic HTML
- ARIA labels where needed
- Clear button titles

## 📦 Component Composition

```
FilterContainer
├── Header
│   ├── Icon (optional)
│   ├── Title & Count
│   └── Actions
│       ├── Badge (optional)
│       ├── Clear Button
│       └── Collapse Toggle
└── Content
    ├── FilterSection (optional)
    │   ├── Section Title
    │   └── FilterGrid
    │       ├── FilterSearchBox
    │       ├── FilterSelect
    │       ├── FilterDateInput
    │       └── FilterButtonGroup
    └── FilterSection (optional)
        └── ...
```

## 🎨 Usage Examples

### Minimal Filter
```tsx
<FilterContainer>
  <FilterSearchBox value={search} onChange={setSearch} />
</FilterContainer>
```

### Standard Filter
```tsx
<FilterContainer title="Filters" onClear={handleClear}>
  <FilterGrid columns={4}>
    <FilterSearchBox {...} />
    <FilterSelect {...} />
    <FilterSelect {...} />
    <FilterDateInput {...} />
  </FilterGrid>
</FilterContainer>
```

### Complex Filter
```tsx
<FilterContainer
  title="Advanced Filters"
  itemCount={{ showing: 10, total: 100 }}
  onClear={handleClear}
  collapsible
  actions={<FilterBadge count={3} />}
>
  <FilterSection title="Quick Filters">
    <FilterButtonGroup {...} />
  </FilterSection>
  
  <FilterSection title="Search & Date">
    <FilterGrid columns={3}>
      <FilterSearchBox {...} />
      <FilterDateRange {...} />
    </FilterGrid>
  </FilterSection>
  
  <FilterSection title="Categories">
    <FilterGrid columns={4}>
      <FilterSelect {...} />
      <FilterSelect {...} />
      <FilterSelect {...} />
      <FilterSelect {...} />
    </FilterGrid>
  </FilterSection>
</FilterContainer>
```

---

**Design System v1.0** | Consistent, accessible, professional
