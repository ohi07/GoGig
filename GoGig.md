# GoGig — Marketplace like Fiverr/Upwork



## Table of Contents
1. Project Overview
2. Feature List (34 features)
3. System Architecture
4. Data Model & ER Diagram
5. API Documentation (endpoints, request/response examples)
6. Frontend Folder Structure & Component Map
7. Backend Folder Structure & Module Map
8. UI Screens (feature-wise wireframes and interaction notes)
9. Software Requirements Specification (SRS)
10. Implementation Roadmap & Milestones
11. UML Class Diagram (text)
12. Security, Testing & QA Plan
13. Deployment & DevOps Guide
14. How to Run Locally (step-by-step)
15. Appendix: Sample JSON Schemas, Validation Rules

---

## 1. Project Overview
GoGig is a full-stack gig marketplace web application similar to Fiverr/Upwork. It enables users to register as buyers or sellers, create and browse gigs, purchase services, communicate via real-time chat, manage orders/payments, and provides admin controls and analytics.

Key technologies (current project):
- Frontend: React
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- Real-time: Socket.IO
- File storage: local `uploads/` (later: cloud storage)
- Payments: Stripe (recommended)


## 2. Feature List (34 features)
(Full feature list condensed; grouped by category)

### Authentication & Account
1. Signup / Registration
2. Login
3. Password Hashing & Authentication
4. Forgot Password & Reset
31. Two-Factor Authentication (2FA)

### User
5. User Profile View
6. Edit Profile
7. Profile Picture Upload
24. Follow Seller

### Gigs & Marketplace
8. Create/Post Gig
9. Upload Gig Images
10. Get/List Gigs
11. Edit/Update Gig
15. Gig Search with Filters
16. Gig Categories & Subcategories
17. Gig Reviews & Ratings
18. Gig FAQs
19. Gig Packages
20. Seller Portfolio
25. Report User / Report Gig

### Communication
21. Real-time Chat (Socket.IO)
22. Order Discussion Thread
23. Notification System (email + in-app)

### Orders & Payments
26. Create Order (Buy Gig)
27. Order Life Cycle (Pending → Accepted → Completed → Cancelled)
28. Payment Integration (Stripe)
29. Invoice Generation
30. Order Dispute Resolution

### Admin & Analytics
32. Admin Panel Dashboard
33. Admin Moderation (users, gigs)
34. Analytics Dashboard

### System
12. MongoDB Integration
13. File Upload System
14. API Routing Structure


## 3. System Architecture
High-level components:
- Client (React SPA)
- API Server (Express)
- Database (MongoDB Atlas)
- Real-time server (Socket.IO attached to Express)
- Payment gateway (Stripe)
- Optional: CDN / Object Storage (S3, Cloudinary)

Diagram (conceptual):
Client ↔ API Server ↔ MongoDB
Client ↔ (Socket.IO) ↔ API Server
API Server ↔ Stripe
API Server ↔ Cloud Storage


## 4. Data Model & ER Diagram
Textual ER design (collections and key fields):

### Users
- _id (ObjectId)
- name
- email (unique)
- passwordHash
- role: [buyer, seller, admin]
- bio
- skills: [String]
- profileImage
- followers: [userId]
- twoFactorEnabled: Boolean
- createdAt, updatedAt

### Gigs
- _id
- sellerId -> Users._id
- title
- description
- category, subcategory
- images: [url]
- price
- packages: [{name, price, deliveryTime, revisions}]
- faqs: [{q, a}]
- rating (computed)
- reviews: [ReviewId]
- createdAt, updatedAt

### Reviews
- _id
- gigId
- reviewerId
- rating
- comment
- createdAt

### Orders
- _id
- gigId
- buyerId
- sellerId
- packageSelected
- price
- status (pending, accepted, in_progress, delivered, completed, cancelled, disputed)
- requirements
- attachments
- invoiceId
- createdAt, updatedAt

### ChatMessages
- _id
- orderId
- senderId
- text
- attachments
- createdAt

### AdminLogs / Reports
- _id
- reporterId
- targetType (user|gig)
- targetId
- reason
- status
- createdAt


## 5. API Documentation
Base URL: `https://yourdomain.com/api/v1` (or `http://localhost:PORT/api/v1`)

### Auth
- `POST /auth/signup`
  - Body: { name, email, password, role }
  - Response: { success, user: {id, name, email, role}, token }

- `POST /auth/login`
  - Body: { email, password }
  - Response: { success, token, user }

- `POST /auth/forgot-password`
  - Body: { email }
  - Response: { success }

- `POST /auth/reset-password`
  - Body: { token, newPassword }
  - Response: { success }

- `POST /auth/enable-2fa`
  - Auth required
  - Body/Flow: returns QR / secret etc.

### User/Profile
- `GET /users/:id`
  - Returns user profile public fields

- `PUT /users/:id`
  - Auth required (owner)
  - Body: { name, bio, skills, ... }

- `POST /users/:id/avatar`
  - Multipart form upload

- `POST /users/:id/follow`
  - Auth required

### Gigs
- `POST /gigs` (create)
  - Auth required (seller)
  - Body: { title, description, price, category, packages[], faqs[], images[] }

- `GET /gigs` (list/search)
  - Query params: q, category, minPrice, maxPrice, rating, page, limit

- `GET /gigs/:id` (detail)

- `PUT /gigs/:id` (update)
  - Auth required (owner)

- `DELETE /gigs/:id`
  - Auth required (owner or admin)

- `POST /gigs/:id/review`
  - Body: { rating, comment }

### Orders
- `POST /orders` (create order)
  - Body: { gigId, buyerRequirements, packageId, paymentMethod }

- `GET /orders/:id`
  - Auth required (buyer/seller/admin)

- `PUT /orders/:id/status` (update status)
  - Auth required
  - Body: { status }

- `POST /orders/:id/deliver` (upload deliverables)

- `POST /orders/:id/dispute`
  - Body: { message, attachments }

### Payments
- `POST /payments/stripe/create-payment-intent`
  - Body: { orderId }

- `POST /payments/stripe/webhook` (server-only)
  - Stripe events: payment_intent.succeeded, charge.failed, etc.

### Chat (Socket.IO)
- Namespace: `/chat`
- Events:
  - `joinOrder` { orderId }
  - `message` { orderId, text, attachments }
  - `typing` { orderId }

### Admin
- `GET /admin/dashboard`
  - Returns: userCount, gigCount, revenue, recentReports

- `POST /admin/ban-user` { userId }
- `POST /admin/remove-gig` { gigId }


## 6. Frontend Folder Structure & Component Map
Suggested structure (refactor/upgrade):

```
frontend/
├─ public/
├─ src/
│  ├─ api/                   # axios clients & endpoints
│  ├─ assets/
│  ├─ components/
│  │  ├─ Auth/
│  │  ├─ Gig/
│  │  ├─ Order/
│  │  ├─ Chat/
│  │  ├─ Admin/
│  ├─ contexts/              # auth, theme, notifications
│  ├─ hooks/                 # useAuth, useSocket
│  ├─ pages/
│  │  ├─ Home.jsx
│  │  ├─ GigsList.jsx
│  │  ├─ GigDetail.jsx
│  │  ├─ Dashboard.jsx
│  │  ├─ AdminPanel.jsx
│  ├─ routes/
│  ├─ utils/
│  └─ App.jsx
```

Component map includes: `LoginForm`, `SignupForm`, `GigCard`, `GigFilters`, `GigForm`, `ChatWindow`, `OrderCard`, `InvoiceView`, `AdminStats`.


## 7. Backend Folder Structure & Module Map
Suggested structure (refactor/upgrade):

```
backend/
├─ controllers/
│  ├─ auth.controller.js
│  ├─ user.controller.js
│  ├─ gig.controller.js
│  ├─ order.controller.js
│  ├─ payment.controller.js
├─ models/
│  ├─ User.js
│  ├─ Gig.js
│  ├─ Order.js
│  ├─ Review.js
│  ├─ ChatMessage.js
├─ routes/
│  ├─ auth.route.js
│  ├─ users.route.js
│  ├─ gigs.route.js
│  ├─ orders.route.js
│  ├─ payments.route.js
├─ services/
│  ├─ email.service.js
│  ├─ payment.service.js
│  ├─ storage.service.js
├─ middlewares/
│  ├─ auth.middleware.js
│  ├─ role.middleware.js
│  ├─ error.middleware.js
├─ utils/
├─ socket/
│  ├─ chat.socket.js
├─ server.js
```


## 8. UI Screens (feature-wise wireframes & interaction notes)
List of primary screens and components:
- Landing / Home: Top categories, search bar, featured gigs
- Auth: Login, Signup, Forgot Password, 2FA flow
- Gigs List: Filters panel, sort, pagination
- Gig Detail: Images, description, seller card, packages, reviews, FAQ
- Buy Flow: Select package, fill requirements, checkout
- Dashboard: For sellers (active orders, earnings) & buyers (orders)
- Chat: Persistent order-specific chat
- Admin Panel: Reports, moderation queue, analytics charts

(Each screen should include responsive/mobile-first layout.)


## 9. Software Requirements Specification (SRS)
### Purpose
Provide a marketplace where buyers can hire sellers offering gig-based services.

### Functional Requirements (selected)
- FR1: The system shall allow users to register, login, and manage profiles.
- FR2: The system shall allow sellers to create, edit, and delete gigs.
- FR3: The system shall allow buyers to search and purchase gigs.
- FR4: The system shall process payments via Stripe.
- FR5: The system shall support real-time messaging for order discussion.
- FR6: The system shall provide admin moderation tools.

### Non-Functional Requirements
- NFR1: System must be responsive and load within 3 seconds for typical pages.
- NFR2: Data must be backed up daily (if using managed DB).
- NFR3: All sensitive data (passwords, tokens) must be stored securely.


## 10. Implementation Roadmap & Milestones
**Phase 0 — Prep (1 week)**
- Project refactor, linting, dependency update
- Set up environments, CI pipeline

**Phase 1 — Core (2 weeks)**
- Harden auth flows, profile, gig CRUD
- Unit tests for core controllers

**Phase 2 — Marketplace (2 weeks)**
- Search, categories, reviews, packages

**Phase 3 — Communication (2 weeks)**
- Socket.IO chat, notifications

**Phase 4 — Orders & Payments (2–3 weeks)**
- Orders lifecycle, Stripe integration, invoices

**Phase 5 — Admin & Analytics (2 weeks)**
- Admin panel, reports, 2FA

**Phase 6 — QA & Deployment (1 week)**
- E2E tests, security audit, deployment


## 11. UML Class Diagram (text)
(Short version — see earlier class diagram for more.)

Classes: User, Gig, Review, Order, ChatMessage, Category, Admin
Relationships: User 1..* Gigs, Gig 1..* Reviews, Order references Gig and User, ChatMessage belongs to Order.


## 12. Security, Testing & QA Plan
- Use HTTPS everywhere (TLS)
- Hash passwords with bcrypt (salt rounds >= 12)
- Use JWT with short expiry + refresh tokens
- Input validation (Joi or express-validator)
- Rate limiting on endpoints (express-rate-limit)
- File type/size checks for uploads
- Automated tests: unit (Jest), integration, E2E (Cypress)
- Penetration testing before launch


## 13. Deployment & DevOps 
- Vercel/Netlify for frontend, Render/Heroku/AWS Elastic Beanstalk for backend, MongoDB Atlas for DB.
- CI (GitHub Actions) to run tests, lint, and deploy.
- environment variables for secrets; never commit `.env`.
- Cloudinary or S3 for storing images (and a CDN).


## 14. How to Run Locally (step-by-step)
### Backend
1. `cd backend`
2. `cp .env.local.example .env.local` and fill in MONGO_URI, JWT_SECRET, PORT, STRIPE keys
3. `npm install`
4. `npm run dev` (or `node server.js`)

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm start`


## 15. Appendix: Sample JSON Schemas & Validation
### User (signup)
```json
{ "name": "string", "email": "email", "password": "min:8" }
```

### Gig Create
```json
{
  "title": "string",
  "description": "string",
  "price": "number",
  "category": "string",
  "packages": [{"name":"string","price":number}]
}
```


## UML Class Diagram

```mermaid
classDiagram
direction LR

%% =====================
%%        USER
%% =====================
class User {
  +ObjectId _id
  +String name
  +String email
  +String passwordHash
  +String role
  +String bio
  +String[] skills
  +String profileImage
  +ObjectId[] followers
  +Boolean twoFactorEnabled
  +Date createdAt
  +Date updatedAt
  +signup()
  +login()
  +updateProfile()
  +enable2FA()
}

%% =====================
%%         GIG
%% =====================
class Gig {
  +ObjectId _id
  +ObjectId sellerId
  +String title
  +String description
  +String category
  +String subcategory
  +String[] images
  +Number price
  +Package[] packages
  +FAQ[] faqs
  +Number rating
  +ObjectId[] reviews
  +Date createdAt
  +Date updatedAt
  +createGig()
  +updateGig()
  +deleteGig()
  +addReview()
}

class Package {
  +String name
  +Number price
  +Number deliveryTime
  +Number revisions
}

class FAQ {
  +String question
  +String answer
}

%% =====================
%%       REVIEW
%% =====================
class Review {
  +ObjectId _id
  +ObjectId gigId
  +ObjectId reviewerId
  +Number rating
  +String comment
  +Date createdAt
}

%% =====================
%%       ORDER
%% =====================
class Order {
  +ObjectId _id
  +ObjectId gigId
  +ObjectId buyerId
  +ObjectId sellerId
  +String packageSelected
  +Number price
  +String status
  +String requirements
  +String[] attachments
  +String invoiceId
  +Date createdAt
  +Date updatedAt
  +createOrder()
  +updateStatus()
  +uploadDelivery()
  +raiseDispute()
}

%% =====================
%%    CHAT MESSAGE
%% =====================
class ChatMessage {
  +ObjectId _id
  +ObjectId orderId
  +ObjectId senderId
  +String text
  +String[] attachments
  +Date createdAt
}

%% =====================
%%       REPORT
%% =====================
class Report {
  +ObjectId _id
  +ObjectId reporterId
  +String targetType
  +ObjectId targetId
  +String reason
  +String status
  +Date createdAt
}

%% =====================
%%       ADMIN
%% =====================
class Admin {
  +banUser()
  +removeGig()
  +viewAnalytics()
}

%% =====================
%%   RELATIONSHIPS
%% =====================

User "1" --> "0..*" Gig : creates
Gig "1" --> "0..*" Review : has
User "1" --> "0..*" Review : writes

Gig "1" --> "0..*" Order : purchased
User "1" --> "0..*" Order : buys
User "1" --> "0..*" Order : sells

Order "1" --> "0..*" ChatMessage : contains
User "1" --> "0..*" ChatMessage : sends

User "1" --> "0..*" Report : files





