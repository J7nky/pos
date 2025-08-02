# Inventory Deduction and Sales Process Documentation

## Overview

This document explains how inventory deduction and sales processing work in the Point of Sale (POS) system, with a focus on the First In, First Out (FIFO) method for inventory management.

## Inventory Deduction Process

### FIFO Implementation

The system uses a First In, First Out (FIFO) approach to manage inventory items. This means that when a sale is made, the system deducts items from inventory based on their receipt date, using the oldest items first.

### Key Components

1. **Inventory Items**: Each inventory item has:
   - `received_at`: Date when the item was received
   - `quantity`: Current quantity in stock
   - `product_id`: Identifier for the product
   - `supplier_id`: Identifier for the supplier

2. **Sale Processing**: When a sale is processed:
   - The system identifies items in inventory that match the product and supplier
   - Items are sorted by `received_at` date (oldest first)
   - Quantities are deducted from the oldest items first
   - If an item's quantity reaches zero, it's not removed but marked as fully sold

### Implementation Details

The inventory deduction logic is implemented in the `OfflineDataContext.tsx` file, specifically in the `addSale` function:

1. **Item Matching**: The system finds inventory items that match the product and supplier of each sale item
2. **Sorting**: Items are sorted by `received_at` date to ensure FIFO processing
3. **Quantity Deduction**: For each sale item, the system iterates through the sorted inventory items and deducts quantities
4. **Sale Item Creation**: New sale items are created with references to the inventory items they were deducted from

## Sales Handling Process

### Sale Creation

When a sale is created in the POS system:

1. **Sale Data**: A new sale record is created with customer information, payment details, and total amounts
2. **Sale Items**: For each product in the sale, a corresponding sale item is created with:
   - Product details (name, price, quantity)
   - Supplier information
   - References to inventory items (via `inventory_item_ids`)
   - Total price calculations

### Financial Processing

Sales are processed through the `ERPFinancialService` which handles:

1. **Customer Credit Sales**: For credit sales, accounts receivable are created and customer balances are updated
2. **Cash Sales**: For cash sales, the cash drawer balance is updated immediately
3. **Supplier Payments**: For commission-based suppliers, commission amounts are calculated and accounts payable are created

### Data Relationships

The system maintains several key relationships between data entities:

1. **Sales and Sale Items**: Each sale has multiple sale items, linked by `sale_id` in the sale items
2. **Sale Items and Inventory**: Each sale item references the inventory items it was deducted from via `inventory_item_ids`
3. **Inventory Tracking**: The system tracks inventory levels in real-time as sales are processed

## Database Schema

### Key Tables

1. **Sales**: Main sales records
2. **SaleItems**: Individual items within a sale
3. **InventoryItems**: Stock items with receipt dates and quantities

### Important Fields

- `sale_id`: Links sale items to their parent sale
- `inventory_item_ids`: Links sale items to the inventory items they were deducted from
- `received_at`: Used for FIFO sorting of inventory items

## Integration Points

### OfflineDataContext

The `OfflineDataContext.tsx` file serves as the primary data management layer, handling:
- Sale creation and inventory deduction
- Data synchronization between local storage and UI components
- Refreshing of data for display in various components

### ERPFinancialService

The `erpFinancialService.ts` file handles all financial aspects:
- Customer and supplier account management
- Accounts receivable and payable processing
- Cash drawer management
- Transaction logging and reporting

## Key Features

1. **Real-time Inventory Tracking**: Inventory levels are updated immediately when sales are processed
2. **FIFO Compliance**: Ensures proper stock rotation by using oldest items first
3. **Financial Integration**: Automatically creates appropriate financial records for each sale type
4. **Audit Trail**: Maintains detailed records of all transactions and inventory movements
5. **Multi-currency Support**: Handles transactions in both USD and LBP with automatic conversion

## Error Handling

The system includes error handling for:
- Insufficient inventory scenarios
- Missing customer or supplier records
- Data validation during sale processing
- Financial transaction failures

This comprehensive approach ensures accurate inventory management while maintaining proper financial records for all sales transactions.