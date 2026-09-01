# LogApart

LogApart is a comprehensive, role-based apartment management system built to modernize how residential complexes handle tenant tracking, structural maintenance, and gate security.

Designed with a focus on usability, it abandons the "one-size-fits-all" dashboard approach in favor of a **Dual Portal Architecture**. The application provides deep, data-rich oversight for Super Admins while delivering a highly focused, high-contrast, distraction-free interface for Security Guards operating at the gate.

---

## 🏗 Architecture & Tech Stack

- **Frontend:** React + Vite, Tailwind CSS, Context API (State Management)
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Authentication:** JWT (JSON Web Tokens) with role-based routing

---

## 🚀 Key Features (Phases 1-5)

### 1. Dual Portal Routing Engine
The core routing engine securely parses JWT tokens and automatically routes users to their purpose-built portal based on their database role (`SUPER_ADMIN` vs `SECURITY`).

### 2. Super Admin Portal (Command Center)
Designed for the building President / Secretary to oversee operations.
- **Visual Unit Heatmap:** A visual grid mapping out 4 floors (20 units total, A-E) displaying real-time occupancy status.
- **Structural Maintenance Kanban:** A ticketing system for building maintenance. Tickets feature automated SLA (Service Level Agreement) countdown timers, changing colors as they approach their deadlines.
- **Gate Oversight (Read-Only):** Admins have full visibility into the real-time security gate logs, but are restricted to a "Read-Only" mode to prevent interference with active guard tracking.

### 3. Security Guard Portal (Gatekeeper)
Designed for iPad/Tablet usage at the main gate.
- **High-Contrast UI:** Stripped of complex menus, prioritizing massive, touch-friendly buttons for rapid entry processing.
- **Live Gate Log:** A real-time table displaying currently active visitors, pinning them to the top with a pulsing "INSIDE" indicator.
- **Instant Checkout:** 1-click checkout flow automatically records exit timestamps and dynamically updates the "Currently Inside" active counters.

---

## 🛠 Local Setup & Installation

### Prerequisites
- Node.js (v18+)
- MySQL (v8.x) running locally

### 1. Database Setup
1. Open MySQL Workbench.
2. Execute the setup SQL scripts to generate the `apartment_admin` database and tables (`users`, `units`, `maintenance_tickets`, `visitor_logs`).
3. Ensure you have the required seed users for testing (e.g., `admin@apartadmin.com` and `guard@apartadmin.com`).

### 2. Backend Configuration
1. Navigate to the backend directory: `cd backend`
2. Install dependencies: `npm install`
3. Configure your `.env` file with your MySQL credentials:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=apartment_admin
   JWT_SECRET=your_jwt_secret
   ```
4. Start the API server: `npm run dev`

### 3. Frontend Configuration
1. Navigate to the frontend directory: `cd frontend`
2. Install dependencies: `npm install`
3. Start the Vite development server: `npm run dev`
4. Access the application at `http://localhost:5173`.

---

## 🗺 Future Roadmap
- **Phase 6:** Shared Utility Billing Engine (Automated bill splitting for EB/Water among occupied units).
- **Phase 7:** Resident Portal (Self-service maintenance logging and invoice tracking).
- **Phase 8:** Pre-Approved Visitor Workflows via Resident App.
