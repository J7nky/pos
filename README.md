# Wholesale Produce Market ERP POS System

A comprehensive Enterprise Resource Planning (ERP) and Point of Sale (POS) system designed specifically for wholesale produce markets. Built with React, TypeScript, Tailwind CSS, and Supabase.

## Features

### Core Modules
- **Dashboard** - Daily operations overview with key metrics
- **Point of Sale (POS)** - Complete sales transaction processing
- **Inventory Management** - Product receiving and stock tracking
- **Accounting** - Financial management and bookkeeping
- **Reports** - Business analytics and reporting
- **Customer Management** - Customer database and credit tracking

### Advanced Search & Filter System

The application includes a comprehensive search and filter system implemented across all select components:

#### SearchableSelect Component Features

1. **Real-time Search**
   - Fuzzy search with typo tolerance
   - 300ms debounced input for performance
   - Instant filtering as you type

2. **Category Filtering**
   - Filter options by category (e.g., Fruits, Vegetables)
   - Visual filter chips showing active filters
   - "All" option to clear category filters

3. **Recent Selections**
   - Automatically tracks recently selected items
   - Quick access to frequently used options
   - Persisted in localStorage

4. **Keyboard Navigation**
   - Arrow keys for option navigation
   - Enter to select, Escape to close
   - Full accessibility support

5. **Multi-select Support**
   - Select multiple options with visual chips
   - "Select All" and "Clear All" buttons
   - Individual item removal

6. **Performance Optimized**
   - Handles 1000+ items efficiently
   - Virtualized scrolling for large datasets
   - Debounced search input

#### Usage Examples

```tsx
// Basic usage
<SearchableSelect
  options={customers.map(c => ({
    id: c.id,
    label: c.name,
    value: c.id,
    category: 'Customer'
  }))}
  value={selectedCustomer}
  onChange={setSelectedCustomer}
  placeholder="Select Customer"
  searchPlaceholder="Search customers..."
/>

// Multi-select with categories
<SearchableSelect
  options={products.map(p => ({
    id: p.id,
    label: p.name,
    value: p.id,
    category: p.category
  }))}
  value={selectedProducts}
  onChange={setSelectedProducts}
  multiple={true}
  categories={['Fruits', 'Vegetables']}
  showSelectAll={true}
  recentSelections={recentProducts}
  onRecentUpdate={setRecentProducts}
/>
```

#### Implementation Locations

The SearchableSelect component is implemented in:
- **POS Module**: Customer selection
- **Inventory Module**: Product and supplier selection
- **Accounting Module**: Customer, supplier, and expense category selection

#### Technical Specifications

- **Debouncing**: 300ms delay for search input
- **Accessibility**: Full ARIA support and screen reader compatibility
- **Responsive**: Mobile-optimized interface
- **Performance**: Optimized for large datasets (1000+ items)
- **Persistence**: Recent selections stored in localStorage

### Key Benefits

1. **Reduced Cognitive Load**: Intuitive interface with smart defaults
2. **Improved Task Completion**: Faster data selection with search and filters
3. **Better User Experience**: Keyboard navigation and accessibility
4. **Performance**: Efficient handling of large datasets
5. **Consistency**: Unified component across all modules

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Authentication, Real-time)
- **Database**: PostgreSQL with Row Level Security
- **Icons**: Lucide React
- **Build Tool**: Vite
- **State Management**: React Context API + Supabase
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime

## Getting Started

### Prerequisites

1. **Supabase Project Setup**
   - Create a new project at [supabase.com](https://supabase.com)
   - Get your project URL and anon key from Settings > API
   - Run the SQL migrations in the Supabase SQL editor

2. **Environment Variables**
   ```bash
   # Create .env.local file
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

## Database Setup

### 1. Run Migrations

Execute the SQL files in your Supabase SQL editor in order:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_seed_data.sql`

### 2. Create Demo User

In Supabase Authentication, create a user:
- Email: demo@market.com
- Password: demo123

Then insert the user profile:
```sql
INSERT INTO users (id, email, name, role, store_id) VALUES 
  ('user_id_from_auth', 'demo@market.com', 'Demo User', 'admin', '550e8400-e29b-41d4-a716-446655440000');
```

## Authentication & Security

### Row Level Security (RLS)

All tables implement RLS policies ensuring:
- Users can only access data from their assigned store
- Multi-tenant architecture with store-based isolation
- Secure API access with proper authentication

### User Roles

- **Admin**: Full system access
- **Manager**: Store management and reporting
- **Cashier**: POS and basic operations

## Project Structure

```
src/
├── lib/
│   └── supabase.ts                # Supabase client configuration
├── services/
│   └── supabaseService.ts         # Database operations
├── contexts/
│   ├── SupabaseAuthContext.tsx    # Authentication state
│   └── SupabaseDataContext.tsx    # Application data state
├── types/
│   └── database.ts                # TypeScript database types
├── components/
│   ├── common/
│   │   └── SearchableSelect.tsx    # Advanced search/filter component
│   ├── SupabaseLogin.tsx          # Authentication component
│   ├── Dashboard.tsx               # Main dashboard
│   ├── POS.tsx                    # Point of sale interface
│   ├── Inventory.tsx              # Inventory management
│   ├── Accounting.tsx             # Financial management
│   ├── Reports.tsx                # Analytics and reporting
│   └── Layout.tsx                 # Main layout wrapper
├── hooks/
│   ├── useLocalStorage.ts         # localStorage hook
│   ├── useCurrency.ts             # Currency formatting
│   └── useSupabase.ts             # Supabase auth hook
├── supabase/
│   └── migrations/                # Database migrations
└── App.tsx                        # Main application component
```

## Features in Detail

### Daily Operations Focus
- All metrics and data focused on current day operations
- Real-time cash drawer management with Supabase
- Today's sales, expenses, and transactions
- Staff-friendly daily journal approach

### Real-time Updates
- Live data synchronization across devices
- Real-time inventory updates
- Instant sales notifications
- Multi-user collaboration

### Cloud-First Architecture
- All data stored securely in Supabase
- Works without internet connection
- Automatic data persistence
- Future sync capabilities ready

### Role-Based Access
- Admin, Manager, and Cashier roles
- Appropriate permissions per role
- Secure authentication system

### Comprehensive Accounting
- Accounts receivable/payable tracking
- Expense categorization and tracking
- Multi-currency support (USD/LBP)
- Financial reporting and analytics

### Multi-Currency Support
- Real exchange rates (1 USD = 89,500 LBP)
- Currency-specific expense tracking
- Automatic conversion for reporting
- Flexible currency display preferences

## Contributing

This is a production-ready ERP system designed for wholesale produce markets. Built with Supabase for scalability, security, and real-time capabilities. The search and filter functionality provides an enterprise-grade user experience that scales with business needs.

## Deployment

### Supabase Configuration
1. Set up your production Supabase project
2. Configure authentication providers
3. Set up database backups
4. Configure edge functions if needed

### Frontend Deployment
1. Build the application: `npm run build`
2. Deploy to your preferred hosting platform
3. Set environment variables in production
4. Configure domain and SSL

## Support

For issues and questions:
1. Check the Supabase documentation
2. Review the database schema
3. Check RLS policies
4. Verify environment variables