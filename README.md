# GoGig

GoGig is a freelance marketplace built from the v7 project archive. Clients post jobs and accept bids from freelancers. An accepted bid creates an order. Buyers can record a demo payment or use Stripe test checkout, freelancers submit delivery notes, and clients approve delivery. Support tickets have private threads, staff replies, notifications, and closure.

The rebuilt app also retains profiles, uploaded images, reviews, the community feed, direct messages, and moderation. Job chat, direct messages, and support updates use authenticated server-sent events. Administrators can review platform activity and test payment volume.

## Run locally

Use Node.js 24 LTS or Node.js 22.12+ with npm. Run these commands from the extracted project folder.

```sh
npm ci --prefix frontend
npm ci --prefix backend
npm run build --prefix frontend
npm start --prefix backend
```

Open http://localhost:5000. You can register as a client or freelancer. For development, start the backend as above and run `npm run dev --prefix frontend` in a second terminal, then open http://localhost:5173. For a custom backend port set `PORT` on the backend and `GOGIG_API_PORT` on the frontend dev server.

## Try an order and a ticket

1. Register a client and freelancer, using separate browser profiles if you want both sessions open.
2. As the client, post a job. As the freelancer, find it in Explore and submit a bid.
3. As the client, accept the proposal and open **Orders**. If the proposal price is to be discussed, set the amount after agreeing on it in order chat. Choose **Record demo payment**.
4. As the freelancer, send an order message and submit delivery. As the client, approve the delivery and print the receipt from the order.
5. Open **Support** or select **Get support** from the order. Submit a ticket and use a staff account to reply. The customer or a staff member can close the thread.

## Set up an administrator

Stop the server first. Copy `backend/.env.example` to `backend/.env`, then set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of 12–128 characters. Run:

```sh
npm run admin:setup --prefix backend
```

Remove the administrator password from the environment file after setup. Start the server and sign in with the new account. Go to **Admin** for the metrics and moderation controls, or **Support** for the ticket queue. The first administrator created using the command is the system operator. Running the command for an existing administrator email resets its password and revokes its sessions.

## Stripe test checkout

Demo mode runs without Stripe credentials. For Stripe test checkout:

1. Set `PAYMENT_MODE=stripe-test`, `PUBLIC_ORIGIN=http://localhost:5000`, and your `STRIPE_SECRET_KEY` in `backend/.env`.
2. Forward test events with Stripe CLI using `stripe listen --forward-to localhost:5000/api/payments/stripe/webhook`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET` and restart GoGig.
3. Use a USD or EUR bid and choose **Open Stripe test checkout**. GoGig records payment after receiving a matching signed Stripe event.

Demo mode supports BDT, USD, and EUR. Stripe mode supports USD and EUR. Both modes are for testing. Stripe Connect seller payouts, live charges, and automatic refunds are outside this build.

## Existing v7 data

The rebuilt project starts with fresh data. To reuse your own v7 data, work from a backup and set `GOGIG_DB_FILE` and `GOGIG_UPLOAD_DIR` to copies of your JSON database and uploaded images. Rotate any previously bundled administrator password with the setup command before starting the server. All users sign in again. Older password hashes are upgraded upon successful sign-in. Previously assigned jobs retain their original completion flow. New orders are created when new proposals are accepted.

The app stores data in a local JSON file and is designed to run as a single Node.js process. The React production build is served by the API process on the same origin. Use the backend on a private machine or development environment, and back up both the database and uploads if you need their contents.

Workspace photograph by Domenico Loia on Unsplash.
