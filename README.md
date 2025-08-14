# Field Orders (Sales + Admin) — Supabase Starter

This is a ready-to-run starter you can use without coding experience. Follow the **Step-by-step** below.

## What you get
- React webapp (mobile-friendly) for your sales team and admin.
- Supabase backend (Postgres + Auth + Realtime).
- Databases: Customers, Products, Orders, Order Items, Status History.
- Role-based access: **sales** vs **admin** (Row-Level Security).
- Live board for order statuses (received → processed → invoiced → shipped → delivered).

---

## Step-by-step (non-coder friendly)

### 0) Prerequisites (one-time)
1. Install **Node.js LTS** (v18 or v20). Download from nodejs.org, click Next/Next.
2. Install **VS Code** (optional but recommended).
3. Create a free account at **app.supabase.com**.

### 1) Create your Supabase project
1. Open https://app.supabase.com → **New project**.
2. Choose a **Project name** (e.g., "Field Orders") and database password (save it).
3. After it initializes, go to **Settings → API** and keep this tab open. You’ll need:
   - `Project URL`
   - `anon public key`

### 2) Create the database tables
1. In Supabase, go to **Database → SQL Editor**.
2. Open `schema.sql` (from this starter) in any text editor, **copy all**.
3. Paste into SQL Editor → **Run**.

### 3) Turn on Row Level Security (RLS) with policies
1. Still in SQL Editor, open `policies.sql`, **copy all**, paste → **Run**.
2. This locks down access by user role (sales vs admin).

### 4) Enable Authentication
1. In Supabase: **Authentication → Providers** → enable **Email** (either “Email + Password” or “Magic Link”). Save.
2. In **Authentication → URL Configuration**, set your site URL while testing locally to `http://localhost:5173`.

### 5) Enable Realtime
1. In Supabase: **Database → Replication → Realtime**.
2. Toggle ON for tables: `orders`, `order_items`, `order_status_history`, `customers`, `products`.

### 6) Download & Run this webapp
1. Unzip the starter to a folder (e.g., `field-orders-starter`).
2. Duplicate `.env.example` → rename to `.env`.
3. In `.env`, paste your Supabase values:
   - `VITE_SUPABASE_URL` ← Project URL
   - `VITE_SUPABASE_ANON_KEY` ← anon public key
4. Open a terminal in the project folder and run:
   ```bash
   npm install
   npm run dev
   ```
5. Open the shown URL (usually http://localhost:5173).

### 7) Create accounts & set roles
1. On the login screen, **Sign Up** an account for yourself (this becomes a regular user).
2. In Supabase: **Authentication → Users**. Copy the **UUID** of the account that should be **admin**.
3. Go to **Database → SQL Editor** and run (replace UUID and name):
   ```sql
   insert into public.profiles (id, full_name, role)
   values ('REPLACE-WITH-USER-UUID', 'Admin Name', 'admin')
   on conflict (id) do update set role='admin', full_name=excluded.full_name;
   ```
4. Refresh the app. The admin user will see the **Admin** section.

### 8) Try the flows
- **Sales user:** Login, add a customer, add a product (if allowed), create an order (status defaults to `received`). See “My Orders” list.
- **Admin user:** Login as admin, go to **Admin** page, see all orders, change status (history is saved).

### 9) Deploy (later, optional)
- Deploy the webapp to Vercel/Netlify. Set the same env variables there.
- Keep using Supabase as your hosted database and auth.

---

## FAQ / Tips
- If you get **RLS** errors, ensure you’re logged in and policies were executed.
- For admin features, double-check the **profiles** table has your user UUID with `role='admin'`.
- Prices are stored on each order line to “snapshot” at time of order.
- You can import/export CSV in Supabase table editor (for products/customers).

---

## Scripts
- `npm run dev` – run locally
- `npm run build` – production build
