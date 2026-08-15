# LogApart: Master Blueprint & Vision (Refined)

## 1. The Core Vision (Refined Focus)
**LogApart** is a strict, efficient **Facility & Infrastructure Management System**. It is designed to track and maintain the *common integrity* of the apartment complex, ensuring safety, structural maintenance, and shared financial responsibility. It explicitly avoids acting as a personal concierge (no personal appliance repairs or individual amenity bookings).

---

## 2. The Core Modules (What we will actually build)

### A. Infrastructure Maintenance (The Ticket System)
- **Scope**: Tickets are strictly for structural or common issues.
- **Examples**: Pipe leakage inside a wall causing seepage, hallway light replacements, elevator breakdowns, or generator failures. (Personal issues like AC/Fridge repair are rejected).
- **Workflow**: Resident raises structural ticket ➔ Admin assesses if it's building responsibility ➔ Assigns to building plumber/electrician ➔ Resolved.

### B. Financials & Shared Utilities (Billing Engine)
- **Fixed Maintenance Dues**: Standard monthly fees based on flat size.
- **Pro-Rata Utility Splitting**: (New Idea) Admin inputs the total common EB (Electricity Board) bill for the month (lifts, hallway lights, water pumps), and LogApart automatically divides the cost among all flats and adds it to their monthly invoice.
- **Water Bill Tracking**: If flats have individual meters, admins can input monthly readings to generate the bill.

### C. Advanced Security & Access
- **Visitor Logs**: Standard gate entries.
- **Daily Helpers (Maids/Cooks)**: Fast-track check-in. Security just taps their photo, and the specific flat is notified that their helper has arrived.
- **Move-In / Move-Out NOC (No Dues Certificate)**: (New Idea) When a tenant is vacating, Security cannot let the moving truck out until the Admin portal generates a digital "Clearance Pass" proving the tenant has zero pending dues.

### D. Vehicle & Parking Compliance (New Idea)
- **Designated Spots**: The database links specific parking bay numbers (e.g., P-14) to a Unit.
- **Violation Logging**: If Security spots an unknown car in P-14, they log a "Parking Violation" ticket. The admin is alerted, and the offending vehicle is flagged at the gate.

### E. Staff & Payroll Management
- **Building Staff**: Tracking attendance for security guards, cleaners, and maintenance crew to help the Admin calculate monthly salaries.

---

## 3. The Visual "Heatmap" Grid (Core Admin Tool)

The Admin's primary screen won't be a boring table. It will be a visual map of the building blocks. 
Admins can toggle the Heatmap modes:
- **Occupancy View**: Green (Occupied), Gray (Vacant).
- **Financial View**: Red (Overdue Dues/EB Bills), Green (Paid up).
- **Maintenance View**: Yellow pulse on units that have reported structural leaks or issues requiring attention.

---

## 4. Role & Access Matrix (RBAC)

| Feature Module | Admin | Security | Resident |
| :--- | :---: | :---: | :---: |
| **Visual Heatmap Grid** | ✅ Full Edit | ❌ Hidden | ❌ Hidden |
| **Shared Utility Billing** | ✅ Input Bills | ❌ Hidden | 👁️ View & Pay Own |
| **Move-Out NOCs** | ✅ Generate | 👁️ Verify Pass | ❌ Hidden |
| **Structural Maintenance** | ✅ Assign/Close | ❌ Hidden | ✅ Create/Track Own |
| **Daily Helpers / Visitors**| 👁️ View All | ✅ Log Entry | 👁️ View Own |
| **Parking Violations** | ✅ Fine/Warn | ✅ Log Violator | 👁️ View Own Violations |
