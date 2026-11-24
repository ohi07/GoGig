const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const { readDb, writeDb } = require('./db');
const { hashPassword, verifyPassword, issueToken, tokenRecord } = require('./security');
const live = require('./live');
const orders = require('./orders');

// Generate a semi‑unique ID using the current time and random bytes
function generateId() {
  return (
    Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex')
  );
}

// List of banned words used for simple content moderation.  If any of these
// words appear in a job title/description or a proposal cover letter then
// the content is automatically flagged.  In a real application you would
// likely use a more sophisticated profanity filter.  These are examples.
const BANNED_WORDS = ['slang', 'irrelevant', 'badword', 'inappropriate'];

// Check whether a given piece of text contains a banned word.  Returns
// true if a banned word is detected, false otherwise.  The check is
// case‑insensitive.  Empty or undefined strings return false.
function containsBannedWords(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BANNED_WORDS.some((w) => lower.includes(w));
}

// Retrieve user information from a token. Returns an object containing
// user details if the token is valid and not expired, otherwise null.
async function authenticate(req) {
  const db = await readDb();
  const record = tokenRecord(db, req.headers.authorization);
  if (!record) return null;
  const user = db.users.find((u) => u.id === record.userId);
  if (!user || user.banned) return null;
  return { ...user };
}

// Check that the user has the required role. Returns true or false.
function hasRole(user, role) {
  return user && user.role === role;
}

// Simplify writing JSON responses
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Serve a static file from the frontend directory. If the file is not found
// then return undefined so the caller can decide what to do next.
async function serveStatic(filePath) {
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
      '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream';
    return { content, contentType };
  } catch (err) {
    return undefined;
  }
}

const frontendDir = path.resolve(__dirname, '../frontend/dist');
const uploadDir = path.resolve(process.env.GOGIG_UPLOAD_DIR || path.join(__dirname, 'uploads'));

async function saveImage(data) {
  if (!data) return null;
  const [, type, encoded] = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data) || [];
  if (!type) return null;
  const bytes = Buffer.from(encoded, 'base64');
  const png = type === 'png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg = type === 'jpeg' && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  const webp = type === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if ((!png && !jpeg && !webp) || bytes.length > 5 * 1024 * 1024) return null;
  const filename = generateId() + '.' + type;
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), bytes);
  return '/uploads/' + filename;
}

async function handleRequest(req, res, pathname) {
  // Serve uploaded images from the uploads directory.  These files are
  // created when jobs are posted with image data.  We serve them
  // directly without exposing the entire filesystem.  Only GET is
  // allowed.  If the file does not exist we fall through to other
  // handlers and eventually return 404.
  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    try {
      const relPath = pathname.replace(/^\/uploads\//, '');
      const filePath = path.join(uploadDir, relPath);
      // Prevent directory traversal
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(uploadDir + path.sep)) {
        throw new Error('Invalid path');
      }
      const content = await fs.readFile(resolved);
      const contentType = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
      }[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    } catch (err) {
      // ignore and fall through to 404
    }
  }

  function getBody() {
    return req.body || {};
  }
  if (await orders.handleOrderRequest(pathname, req, res, { authenticate, readDb, writeDb, sendJson, getBody }) !== false) return;

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const db = await readDb();
    const record = tokenRecord(db, req.headers.authorization);
    if (record) {
      db.tokens = db.tokens.filter((token) => token !== record);
      await writeDb(db);
      live.disconnect(record.userId);
    }
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/api/admin/analytics' && req.method === 'GET') {
    const user = await authenticate(req);
    if (user?.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    return sendJson(res, 200, orders.analytics(await readDb()));
  }

  // API routes
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const {
        name,
        email,
        password,
        role,
        age,
        skills,
        education,
        company,
        about,
      } = await getBody();
      if (typeof name !== 'string' || !name.trim() || name.length > 100 ||
          typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
          typeof password !== 'string' || password.length < 10 || password.length > 128) {
        return sendJson(res, 400, { error: 'Enter a name, valid email and a password of 10–128 characters' });
      }
      if (!['client', 'freelancer'].includes(role)) {
        return sendJson(res, 400, { error: 'Choose client or freelancer' });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const db = await readDb();
      if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
        return sendJson(res, 400, { error: 'Email already registered' });
      }
      // Normalize profile fields
      const normalizedSkills = Array.isArray(skills)
        ? skills
        : typeof skills === 'string'
        ? skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const user = {
        id: generateId(),
        name: name.trim(),
        email: normalizedEmail,
        password: await hashPassword(password),
        role,
        banned: false,
        createdAt: new Date().toISOString(),
        // Optional profile fields
        age: age ? Number(age) : null,
        skills: normalizedSkills,
        education: education || null,
        company: company || null,
        about: about || null,
        // New fields: moderator flag and avatar
        moderator: false,
        avatar: null,
        // warning fields and sysop markers
        warned: false,
        warnReason: null,
        sysop: false,
        prevRole: null,
      };
      db.users.push(user);
      const token = issueToken(db, user.id);
      await writeDb(db);
      return sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          banned: user.banned,
          moderator: !!user.moderator,
          avatar: user.avatar || null,
        },
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to register user' });
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { email, password } = await getBody();
      if (typeof email !== 'string' || !email.trim() || email.length > 254 ||
          typeof password !== 'string' || !password || password.length > 128) {
        return sendJson(res, 400, { error: 'Email and password are required' });
      }
      const db = await readDb();
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!await verifyPassword(password, user?.password) || !user) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }
      if (user.banned) {
        // Do not issue a token for banned users
        return sendJson(res, 403, { error: 'Your account has been banned' });
      }
      if (!user.password.startsWith('scrypt:')) user.password = await hashPassword(password);
      const token = issueToken(db, user.id);
      await writeDb(db);
      return sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          banned: user.banned,
          moderator: !!user.moderator,
          avatar: user.avatar || null,
        },
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to log in' });
    }
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    // Include profile fields (excluding password and banned) so clients can
    // display a profile without extra requests.  We intentionally omit
    // sensitive fields such as hashed password and tokens.  Email is
    // included for the logged in user only.
    return sendJson(res, 200, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      age: user.age || null,
      skills: user.skills || [],
      education: user.education || null,
      company: user.company || null,
      about: user.about || null,
      banned: user.banned || false,
      moderator: !!user.moderator,
      avatar: user.avatar || null,
    });
  }

  if (pathname === '/api/jobs' && req.method === 'GET') {
    const user = await authenticate(req);
    const db = await readDb();
    let jobs;
    if (user && user.role === 'client') {
      // Clients see their own jobs, regardless of flag
      jobs = db.jobs.filter((j) => j.clientId === user.id);
    } else if (user && user.role === 'admin') {
      // Admins see all jobs
      jobs = db.jobs;
    } else {
      // Freelancers and unauthenticated users see only open jobs that are not flagged
      jobs = db.jobs.filter((j) => j.status === 'open' && !j.flagged);
    }
    return sendJson(res, 200, jobs);
  }

  if (pathname === '/api/jobs' && req.method === 'POST') {
    const user = await authenticate(req);
    // Allow clients and admins to create jobs.  Admins can post jobs
    if (!user || (user.role !== 'client' && user.role !== 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    try {
      const {
        title,
        description,
        budget,
        currency,
        deadline,
        imageBase64,
      } = await getBody();
      if (typeof title !== 'string' || !title.trim() || title.length > 160 ||
          typeof description !== 'string' || !description.trim() || description.length > 10000) {
        return sendJson(res, 400, {
          error: 'Title and description are required',
        });
      }
      const db = await readDb();
      // Determine whether the job should be flagged
      const flagged = containsBannedWords(title) || containsBannedWords(description);

      const imagePath = await saveImage(imageBase64);
      if (imageBase64 && !imagePath) return sendJson(res, 400, { error: 'Choose a PNG, JPEG or WebP image up to 5 MB' });
      // Determine final budget and currency.  If no budget provided and
      // currency is 'Discuss', treat as upon discussion by storing
      // null budget and currency 'Discuss'.  If a budget is provided,
      // ensure it is trimmed and use the provided currency or default.
      let finalBudget = null;
      let finalCurrency = currency || '৳';
      if (budget !== undefined && budget !== null && budget !== '') {
        finalBudget = budget;
      }
      if (finalCurrency === 'Discuss') finalBudget = null;
      const job = {
        id: generateId(),
        title,
        description,
        budget: finalBudget,
        currency: finalCurrency,
        deadline: deadline || null,
        image: imagePath,
        clientId: user.id,
        status: flagged ? 'flagged' : 'open',
        flagged,
        assignedFreelancerId: null,
        createdAt: new Date().toISOString(),
      };
      db.jobs.push(job);
      await writeDb(db);
      return sendJson(res, 201, job);
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to create job' });
    }
  }

  // /api/jobs/:id (GET)
  const jobMatch = pathname.match(/^\/api\/jobs\/([^\/]+)$/);
  if (jobMatch && req.method === 'GET') {
    const jobId = jobMatch[1];
    const user = await authenticate(req);
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    // Hide flagged jobs from freelancers and unauthenticated users
    if (job.flagged && (!user || (user.role !== 'admin' && !user.moderator && user.id !== job.clientId))) {
      return sendJson(res, 403, { error: 'Job is not available' });
    }
    let proposals = [];
    if (user && user.id === job.clientId) {
      // Client sees all proposals on their job
      proposals = db.proposals.filter((p) => p.jobId === jobId);
    } else if (user && user.role === 'freelancer') {
      // Freelancer sees their own proposal on this job, if any, excluding flagged proposals
      proposals = db.proposals.filter(
        (p) => p.jobId === jobId && p.freelancerId === user.id && !p.flagged
      );
    } else if (user && user.role === 'admin') {
      proposals = db.proposals.filter((p) => p.jobId === jobId);
    }
    const order = user && [job.clientId, job.assignedFreelancerId].includes(user.id)
      ? db.orders.find((entry) => entry.jobId === jobId)
      : undefined;
    return sendJson(res, 200, { ...job, proposals, orderId: order?.id });
  }

  // /api/jobs/:id/proposals (POST)
  const proposalPostMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/proposals$/);
  if (proposalPostMatch && req.method === 'POST') {
    const jobId = proposalPostMatch[1];
    const user = await authenticate(req);
    if (!user || !hasRole(user, 'freelancer')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    try {
      // Allow currency and amount to be optionally provided.  If
      // currency is "Discuss" and amount is empty, treat as upon
      // discussion and store null amount.  Otherwise require amount.
      const { coverLetter, amount, currency } = await getBody();
      if (typeof coverLetter !== 'string' || !coverLetter.trim()) {
        return sendJson(res, 400, {
          error: 'Cover letter is required',
        });
      }
      const db = await readDb();
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) {
        return sendJson(res, 404, { error: 'Job not found' });
      }
      if (job.status !== 'open') {
        return sendJson(res, 400, { error: 'Proposals are closed for this job' });
      }
      if (job.flagged) {
        return sendJson(res, 403, { error: 'Cannot propose on a flagged job' });
      }
      const existing = db.proposals.find((p) => p.jobId === jobId && p.freelancerId === user.id);
      if (existing) {
        return sendJson(res, 400, {
          error: 'You have already submitted a proposal for this job',
        });
      }
      // Determine final amount and currency.  Use job currency as default.
      let finalCurrency = currency || job.currency || '৳';
      let finalAmount = null;
      if (amount !== undefined && amount !== null && amount !== '') {
        finalAmount = amount;
      }
      if (finalCurrency === 'Discuss') {
        finalAmount = null;
      } else if (!orders.proposalTotal(finalAmount, finalCurrency)) {
        return sendJson(res, 400, { error: 'Enter a positive bid with up to two decimal places or choose Upon discussion' });
      }
      const proposalFlagged = containsBannedWords(coverLetter);
      const proposal = {
        id: generateId(),
        jobId,
        freelancerId: user.id,
        coverLetter,
        amount: finalAmount,
        currency: finalCurrency,
        status: proposalFlagged ? 'flagged' : 'pending',
        flagged: proposalFlagged,
        createdAt: new Date().toISOString(),
        // Track whether the freelancer has been notified of acceptance/rejection
        notified: true,
      };
      db.proposals.push(proposal);
      await writeDb(db);
      return sendJson(res, 201, proposal);
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to submit proposal' });
    }
  }

  // /api/jobs/:id/proposals (GET) for client only
  const proposalGetMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/proposals$/);
  if (proposalGetMatch && req.method === 'GET') {
    const jobId = proposalGetMatch[1];
    const user = await authenticate(req);
    if (!user || !['client', 'admin'].includes(user.role)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    if (job.clientId !== user.id) {
      return sendJson(res, 403, { error: 'You do not own this job' });
    }
    const proposals = db.proposals.filter((p) => p.jobId === jobId);
    return sendJson(res, 200, proposals);
  }

  // /api/jobs/:jobId/proposals/:proposalId/accept (PUT)
  const acceptMatch = pathname.match(
    /^\/api\/jobs\/([^\/]+)\/proposals\/([^\/]+)\/accept$/
  );
  if (acceptMatch && req.method === 'PUT') {
    const jobId = acceptMatch[1];
    const proposalId = acceptMatch[2];
    const user = await authenticate(req);
    if (!user || !['client', 'admin'].includes(user.role)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    if (job.clientId !== user.id) {
      return sendJson(res, 403, { error: 'You do not own this job' });
    }
    if (job.status !== 'open') {
      return sendJson(res, 400, { error: 'Job is not open' });
    }
    const proposal = db.proposals.find(
      (p) => p.id === proposalId && p.jobId === jobId
    );
    if (!proposal) {
      return sendJson(res, 404, { error: 'Proposal not found' });
    }
    const freelancer = db.users.find((entry) => entry.id === proposal.freelancerId);
    if (job.flagged || proposal.flagged || proposal.status !== 'pending' || !freelancer || freelancer.banned) {
      return sendJson(res, 409, { error: 'This proposal is unavailable' });
    }
    // Accept this proposal and reject others.  Mark all as not notified so freelancers can see updates.
    for (const p of db.proposals) {
      if (p.jobId !== jobId) continue;
      if (p.id === proposalId) {
        p.status = 'accepted';
        p.notified = false;
      } else {
        p.status = 'rejected';
        p.notified = false;
      }
    }
    job.status = 'assigned';
    job.assignedFreelancerId = proposal.freelancerId;
    db.orders.push(orders.createOrder(job, proposal));
    // Send a notification to the accepted freelancer with details
    try {
      const dm = {
        id: generateId(),
        senderId: user.id,
        recipientId: proposal.freelancerId,
        text: `Your proposal for job "${job.title}" has been accepted. Bid amount: ${proposal.amount !== null && proposal.amount !== undefined ? proposal.amount + ' ' + (proposal.currency === 'Discuss' ? '(upon discussion)' : proposal.currency) : 'upon discussion'}. Please review the job details and coordinate with the client to begin work.`,
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
        type: 'notification',
        linkType: 'job',
        linkId: jobId,
      };
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    } catch (e) {
      // If DM creation fails, ignore
    }
    await writeDb(db);
    live.publish([proposal.freelancerId, job.clientId]);
    return sendJson(res, 200, { job, acceptedProposal: proposal });
  }

  // /api/jobs/:jobId/complete (PUT) - client marks job as completed
  const completeMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/complete$/);
  if (completeMatch && req.method === 'PUT') {
    const jobId = completeMatch[1];
    const user = await authenticate(req);
    if (!user || !['client', 'admin'].includes(user.role)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    if (job.clientId !== user.id) {
      return sendJson(res, 403, { error: 'You do not own this job' });
    }
    if (job.status !== 'assigned') {
      return sendJson(res, 400, { error: 'Job must be assigned before completion' });
    }
    const order = db.orders.find((entry) => entry.jobId === job.id);
    if (order && order.status !== 'delivered') {
      return sendJson(res, 409, { error: 'The freelancer must submit delivery before you complete this order' });
    }
    orders.completeOrder(job, order);
    await writeDb(db);
    live.publish([job.clientId, job.assignedFreelancerId]);
    return sendJson(res, 200, { job });
  }

  // ---------------------------------------
  // Review routes

  // GET /api/jobs/:jobId/reviews - list reviews for a job
  const reviewsGetMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/reviews$/);
  if (reviewsGetMatch && req.method === 'GET') {
    const jobId = reviewsGetMatch[1];
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    // Filter reviews for this job
    const reviews = db.reviews.filter((r) => r.jobId === jobId);
    // Optionally sort by newest
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, reviews);
  }

  // POST /api/jobs/:jobId/reviews - submit a review (client/freelancer) once job is completed
  const reviewsPostMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/reviews$/);
  if (reviewsPostMatch && req.method === 'POST') {
    const jobId = reviewsPostMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    try {
      const { rating, comment } = await getBody();
      const db = await readDb();
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) {
        return sendJson(res, 404, { error: 'Job not found' });
      }
      // Only allow reviews after job completion
      if (job.status !== 'completed') {
        return sendJson(res, 400, { error: 'Job must be completed before reviews can be submitted' });
      }
      // Determine reviewer and reviewee.  Client reviews freelancer and vice versa.
      let revieweeId;
      if (currentUser.id === job.clientId) {
        revieweeId = job.assignedFreelancerId;
      } else if (currentUser.id === job.assignedFreelancerId) {
        revieweeId = job.clientId;
      } else {
        return sendJson(res, 403, { error: 'You did not participate in this job' });
      }
      // Prevent multiple reviews by same reviewer on same job
      const existingReview = db.reviews.find((r) => r.jobId === jobId && r.reviewerId === currentUser.id);
      if (existingReview) {
        return sendJson(res, 400, { error: 'You have already reviewed this job' });
      }
      // Validate rating 1-5
      const numericRating = Number(rating);
      if (!numericRating || numericRating < 1 || numericRating > 5) {
        return sendJson(res, 400, { error: 'Rating must be between 1 and 5' });
      }
      const flagged = containsBannedWords(comment);
      const review = {
        id: generateId(),
        jobId,
        reviewerId: currentUser.id,
        revieweeId,
        rating: numericRating,
        comment: comment ? comment.trim() : '',
        flagged,
        createdAt: new Date().toISOString(),
      };
      db.reviews.push(review);
      // Send notification to reviewee
      if (revieweeId && revieweeId !== currentUser.id) {
        const dm = {
          id: generateId(),
          senderId: currentUser.id,
          recipientId: revieweeId,
          text: `${currentUser.name || 'Someone'} left you a review.`,
          createdAt: new Date().toISOString(),
          seen: false,
          reactions: {},
          type: 'notification',
          linkType: 'review',
          linkId: review.id || jobId,
        };
        if (!db.dms) db.dms = [];
        db.dms.push(dm);
      }
      await writeDb(db);
      return sendJson(res, 201, review);
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to submit review' });
    }
  }

  // ------------------------------
  // Admin routes
  // Only users with role 'admin' can access these endpoints.  These routes
  // enable moderation of users, jobs and proposals.

  // GET /api/admin/users - list all users
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user || (user.role !== 'admin' && !user.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    let list = db.users;
    // If requester is a moderator (not admin), exclude admins and only return basic info
    if (user.role !== 'admin' && user.moderator) {
      list = list.filter((u) => u.role !== 'admin');
    }
    const users = list.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      banned: !!u.banned,
      moderator: !!u.moderator,
    }));
    return sendJson(res, 200, users);
  }

  // PUT /api/admin/users/:id/ban - toggle a user's banned status
  const adminBanMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)\/ban$/);
  if (adminBanMatch && req.method === 'PUT') {
    const targetId = adminBanMatch[1];
    const currentUser = await authenticate(req);
    // Only admins and moderators may ban/unban
    if (!currentUser || (currentUser.role !== 'admin' && !currentUser.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // Mods and non‑sysop admins cannot ban admins
    if (target.role === 'admin') {
      // Only a sysop admin may toggle another admin's banned status
      if (!currentUser.sysop) {
        return sendJson(res, 400, { error: 'Cannot ban an admin' });
      }
      // Do not allow banning the sysop
      if (target.sysop) {
        return sendJson(res, 400, { error: 'Cannot ban the system operator' });
      }
    }
    // Do not allow banning yourself
    if (target.id === currentUser.id) {
      return sendJson(res, 400, { error: 'You cannot ban yourself' });
    }
    // Toggle the banned status
    target.banned = !target.banned;
    if (target.banned) db.tokens = db.tokens.filter((token) => token.userId !== target.id);
    // Send notification to the user about their ban/unban
    try {
      const dm = {
        id: generateId(),
        senderId: currentUser.id,
        recipientId: target.id,
        text: target.banned
          ? 'You have been banned from GoGig.'
          : 'Your ban has been lifted. You may now log in again.',
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
        type: 'notification',
        linkType: 'profile',
        linkId: target.id,
      };
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    } catch (e) {
      // ignore DM errors
    }
    await writeDb(db);
    if (target.banned) live.disconnect(target.id);
    return sendJson(res, 200, { id: target.id, banned: target.banned });
  }

  // PUT /api/admin/users/:id/moderator - toggle a user's moderator status
  const adminModMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)\/moderator$/);
  if (adminModMatch && req.method === 'PUT') {
    const targetId = adminModMatch[1];
    const user = await authenticate(req);
    if (!user || !hasRole(user, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // Do not allow toggling moderator on yourself
    if (target.id === user.id) {
      return sendJson(res, 400, { error: 'You cannot change your own moderator status' });
    }
    // Do not allow changing moderator status of another admin
    if (target.role === 'admin') {
      return sendJson(res, 400, { error: 'Cannot change moderator status of an admin' });
    }
    // Toggle moderator status
    target.moderator = !target.moderator;
    // If the user has just been promoted to moderator, send them a DM notification
    if (target.moderator) {
      // Compose a message notifying the user of their new moderator privileges
      const dm = {
        id: generateId(),
        senderId: user.id,
        recipientId: target.id,
        text:
          'Congratulations! You have been promoted to moderator. You now have access to moderation tools and can help manage flagged content. Please let the admin know if you have any questions.',
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
      };
      // Ensure dms array exists
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    }
    await writeDb(db);
    return sendJson(res, 200, { id: target.id, moderator: target.moderator });
  }

  // PUT /api/admin/users/:id/admin - toggle a user's admin role.  Only the system operator can assign or remove admin privileges.
  const adminAdminMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)\/admin$/);
  if (adminAdminMatch && req.method === 'PUT') {
    const targetId = adminAdminMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser || currentUser.role !== 'admin' || !currentUser.sysop) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // Cannot change your own admin role if you are the sysop
    if (target.id === currentUser.id) {
      return sendJson(res, 400, { error: 'You cannot change your own admin status' });
    }
    // Cannot demote another sysop (there should only ever be one sysop)
    if (target.sysop) {
      return sendJson(res, 400, { error: 'Cannot modify system operator' });
    }
    let message;
    if (target.role === 'admin') {
      // Demote back to previous role or client if unknown
      const newRole = target.prevRole || 'client';
      target.role = newRole;
      target.prevRole = null;
      message = 'Your admin privileges have been revoked.';
    } else {
      // Promote to admin
      target.prevRole = target.role;
      target.role = 'admin';
      message = 'You have been promoted to admin.';
    }
    // Send notification to the user about role change
    try {
      const dm = {
        id: generateId(),
        senderId: currentUser.id,
        recipientId: target.id,
        text: message.trim(),
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
        type: 'notification',
        linkType: 'profile',
        linkId: target.id,
      };
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    } catch (e) {
      // ignore DM errors
    }
    await writeDb(db);
    return sendJson(res, 200, { id: target.id, role: target.role });
  }

  // PUT /api/admin/users/:id/warn - send a warning message to a user.  Admins and moderators can warn.  Cannot warn admins.
  const adminWarnMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)\/warn$/);
  if (adminWarnMatch && req.method === 'PUT') {
    const targetId = adminWarnMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser || (currentUser.role !== 'admin' && !currentUser.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // Do not allow warning admins
    if (target.role === 'admin') {
      return sendJson(res, 400, { error: 'Cannot warn an admin' });
    }
    // Body may contain a custom message
    const body = await getBody();
    const message = body && body.message ? String(body.message).trim() : '';
    const dmText = message || `${currentUser.name || 'Moderator'} has issued you a warning for violating our guidelines. Please adhere to the rules.`;
    // Mark the user as warned and store the reason
    target.warned = true;
    target.warnReason = dmText;
    const dm = {
      id: generateId(),
      senderId: currentUser.id,
      recipientId: target.id,
      text: dmText,
      createdAt: new Date().toISOString(),
      seen: false,
      reactions: {},
      type: 'notification',
      linkType: 'profile',
      linkId: target.id,
    };
    if (!db.dms) db.dms = [];
    db.dms.push(dm);
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  // PUT /api/admin/users/:id/unwarn - remove a warning from a user.  Admins and moderators can clear warnings.
  const adminUnwarnMatch = pathname.match(/^\/api\/admin\/users\/([^\/]+)\/unwarn$/);
  if (adminUnwarnMatch && req.method === 'PUT') {
    const targetId = adminUnwarnMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser || (currentUser.role !== 'admin' && !currentUser.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // Do not allow unwarning admins if the caller is only a moderator
    if (target.role === 'admin' && !currentUser.sysop) {
      return sendJson(res, 400, { error: 'Cannot modify warnings for an admin' });
    }
    // Clear warning flags
    target.warned = false;
    target.warnReason = null;
    // Send notification to the user that the warning has been cleared
    try {
      const dm = {
        id: generateId(),
        senderId: currentUser.id,
        recipientId: target.id,
        text: 'Your warning has been removed.',
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
        type: 'notification',
        linkType: 'profile',
        linkId: target.id,
      };
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    } catch (e) {
      // ignore DM errors
    }
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  // GET /api/admin/proposals - list all proposals (admin only)
  if (pathname === '/api/admin/proposals' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser || !hasRole(currentUser, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    return sendJson(res, 200, db.proposals);
  }

  // PUT /api/proposals/:id/notified - mark a proposal as notified by the freelancer.  Requires authentication.
  const proposalNotifyMatch = pathname.match(/^\/api\/proposals\/([^\/]+)\/notified$/);
  if (proposalNotifyMatch && req.method === 'PUT') {
    const proposalId = proposalNotifyMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const proposal = db.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return sendJson(res, 404, { error: 'Proposal not found' });
    }
    // Only the freelancer who submitted the proposal can mark it as notified
    if (proposal.freelancerId !== currentUser.id) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    proposal.notified = true;
    await writeDb(db);
    return sendJson(res, 200, { id: proposal.id, notified: true });
  }

  // GET /api/proposals - list proposals relevant to the current user.
  // Freelancers see proposals they have submitted.  Clients see proposals
  // submitted to their jobs.  Admins see all proposals.  Includes
  // associated job information to make it easy to display.  Requires
  // authentication.
  if (pathname === '/api/proposals' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    let proposals = [];
    if (currentUser.role === 'freelancer') {
      // Proposals submitted by freelancer
      proposals = db.proposals.filter((p) => p.freelancerId === currentUser.id);
    } else if (currentUser.role === 'client') {
      // Proposals for client's jobs
      const jobIds = db.jobs.filter((j) => j.clientId === currentUser.id).map((j) => j.id);
      proposals = db.proposals.filter((p) => jobIds.includes(p.jobId));
    } else if (currentUser.role === 'admin') {
      proposals = db.proposals;
    } else if (currentUser.moderator) {
      // Moderators see all proposals to assist with moderation
      proposals = db.proposals;
    }
    // For each proposal, include job details
    const result = proposals.map((p) => {
      const job = db.jobs.find((j) => j.id === p.jobId) || null;
      const freelancer = db.users.find((u) => u.id === p.freelancerId) || null;
      return { ...p, job, freelancer: freelancer ? { id: freelancer.id, name: freelancer.name } : null };
    });
    return sendJson(res, 200, result);
  }

  // GET /api/admin/jobs - list all jobs
  if (pathname === '/api/admin/jobs' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user || !hasRole(user, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    return sendJson(res, 200, db.jobs);
  }

  // GET /api/admin/jobs/:id - get specific job details
  const adminJobGetMatch = pathname.match(/^\/api\/admin\/jobs\/([^\/]+)$/);
  if (adminJobGetMatch && req.method === 'GET') {
    const jobId = adminJobGetMatch[1];
    const user = await authenticate(req);
    if (!user || !hasRole(user, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    const proposals = db.proposals.filter((p) => p.jobId === jobId);
    return sendJson(res, 200, { ...job, proposals });
  }

  // DELETE /api/admin/jobs/:id/delete - remove a job and its proposals
  const adminJobDeleteMatch = pathname.match(/^\/api\/admin\/jobs\/([^\/]+)\/delete$/);
  if (adminJobDeleteMatch && req.method === 'DELETE') {
    const jobId = adminJobDeleteMatch[1];
    const user = await authenticate(req);
    if (!user || !hasRole(user, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const jobIndex = db.jobs.findIndex((j) => j.id === jobId);
    if (jobIndex === -1) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    if (db.orders.some((order) => order.jobId === jobId)) {
      return sendJson(res, 409, { error: 'A job with an order must be retained for its order history' });
    }
    // Remove job
    db.jobs.splice(jobIndex, 1);
    // Remove proposals associated with job
    db.proposals = db.proposals.filter((p) => p.jobId !== jobId);
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  // DELETE /api/admin/proposals/:id/delete - remove a proposal
  const adminPropDeleteMatch = pathname.match(/^\/api\/admin\/proposals\/([^\/]+)\/delete$/);
  if (adminPropDeleteMatch && req.method === 'DELETE') {
    const propId = adminPropDeleteMatch[1];
    const user = await authenticate(req);
    if (!user || !hasRole(user, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const index = db.proposals.findIndex((p) => p.id === propId);
    if (index === -1) {
      return sendJson(res, 404, { error: 'Proposal not found' });
    }
    if (db.proposals[index].status === 'accepted' && db.orders.some((order) => order.jobId === db.proposals[index].jobId)) {
      return sendJson(res, 409, { error: 'An accepted proposal must be retained for its order history' });
    }
    db.proposals.splice(index, 1);
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  // GET /api/admin/flagged - return all flagged jobs and proposals
  if (pathname === '/api/admin/flagged' && req.method === 'GET') {
    const user = await authenticate(req);
    if (!user || (!hasRole(user, 'admin') && !user.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const flaggedJobs = db.jobs.filter((j) => j.flagged);
    const flaggedProposals = db.proposals.filter((p) => p.flagged);
    return sendJson(res, 200, { jobs: flaggedJobs, proposals: flaggedProposals });
  }

  // PUT /api/admin/jobs/:id/unflag - remove a job's flagged status
  const adminJobUnflagMatch = pathname.match(/^\/api\/admin\/jobs\/([^\/]+)\/unflag$/);
  if (adminJobUnflagMatch && req.method === 'PUT') {
    const jobId = adminJobUnflagMatch[1];
    const user = await authenticate(req);
    if (!user || (!hasRole(user, 'admin') && !user.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    job.flagged = false;
    if (job.status === 'flagged') {
      job.status = 'open';
    }
    await writeDb(db);
    return sendJson(res, 200, job);
  }

  // PUT /api/admin/proposals/:id/unflag - remove a proposal's flagged status
  const adminPropUnflagMatch = pathname.match(/^\/api\/admin\/proposals\/([^\/]+)\/unflag$/);
  if (adminPropUnflagMatch && req.method === 'PUT') {
    const propId = adminPropUnflagMatch[1];
    const user = await authenticate(req);
    if (!user || (!hasRole(user, 'admin') && !user.moderator)) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const prop = db.proposals.find((p) => p.id === propId);
    if (!prop) {
      return sendJson(res, 404, { error: 'Proposal not found' });
    }
    prop.flagged = false;
    if (prop.status === 'flagged') {
      prop.status = 'pending';
    }
    await writeDb(db);
    return sendJson(res, 200, prop);
  }

  // -------------------------------------------------
  // User profile routes

  // GET /api/users/:id - public profile.  Returns limited information
  // about the user.  Admin profiles are private unless requested by
  // another admin or the admin themselves.
  const userGetMatch = pathname.match(/^\/api\/users\/([^\/]+)$/);
  if (userGetMatch && req.method === 'GET') {
    const targetId = userGetMatch[1];
    const currentUser = await authenticate(req);
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // Determine what fields to return
    const isSelf = currentUser && currentUser.id === target.id;
    const isAdminViewer = currentUser && currentUser.role === 'admin';
    const isModViewer = currentUser && currentUser.moderator;
    // Base profile always contains id, name, role and avatar
    const profile = {
      id: target.id,
      name: target.name,
      role: target.role,
      avatar: target.avatar || null,
      // include moderator status for all viewers so they can see mod badges
      moderator: !!target.moderator,
      // always include banned and warned flags so users can see if someone is banned or warned
      banned: !!target.banned,
      warned: !!target.warned,
    };
    // Only include sensitive details (age, skills, education, company, about, createdAt) if
    // the user is not a private admin view.  Admins have private profiles
    // but should still show their name and avatar.  If the target is not an admin
    // or the viewer is the same user or an admin or moderator, include the extra info.
    const canViewDetails = target.role !== 'admin' || isSelf || isAdminViewer || isModViewer;
    if (canViewDetails) {
      profile.age = target.age || null;
      profile.skills = target.skills || [];
      profile.education = target.education || null;
      profile.company = target.company || null;
      profile.about = target.about || null;
      profile.createdAt = target.createdAt;
    }
    // Only include email if self or admin viewer
    if (isSelf || isAdminViewer) {
      profile.email = target.email;
    }
    return sendJson(res, 200, profile);
  }

  // PUT /api/users/me - update own profile.  Accepts partial updates for
  // name, age, skills, education, company, about.  Email and role
  // cannot be changed here.  Admins can also update other profiles
  // using /api/users/:id with same semantics.
  if ((pathname === '/api/users/me' || pathname.startsWith('/api/users/')) && req.method === 'PUT') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    // Determine target user id: if /me then current user; else path param
    let targetId;
    if (pathname === '/api/users/me') {
      targetId = currentUser.id;
    } else {
      const m = pathname.match(/^\/api\/users\/([^\/]+)$/);
      if (!m) {
        // Should not happen
        targetId = currentUser.id;
      } else {
        targetId = m[1];
      }
    }
    // Only admin can update other users
    if (targetId !== currentUser.id && currentUser.role !== 'admin') {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    const body = await getBody();
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    // If target is admin and updater is not same admin, forbid update
    if (target.role === 'admin' && currentUser.id !== target.id && currentUser.role !== 'admin') {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    // Update allowed fields
    if (body.name) target.name = body.name;
    if (body.age !== undefined) target.age = body.age !== null ? Number(body.age) : null;
    if (body.skills !== undefined) {
      if (Array.isArray(body.skills)) {
        target.skills = body.skills;
      } else if (typeof body.skills === 'string') {
        target.skills = body.skills.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    if (body.education !== undefined) target.education = body.education || null;
    if (body.company !== undefined) target.company = body.company || null;
    if (body.about !== undefined) target.about = body.about || null;

    const avatar = await saveImage(body.avatarBase64);
    if (body.avatarBase64 && !avatar) return sendJson(res, 400, { error: 'Choose a PNG, JPEG or WebP image up to 5 MB' });
    if (avatar) target.avatar = avatar;
    await writeDb(db);
    // Return updated safe profile
    const updated = {
      id: target.id,
      name: target.name,
      role: target.role,
      age: target.age || null,
      skills: target.skills || [],
      education: target.education || null,
      company: target.company || null,
      about: target.about || null,
      createdAt: target.createdAt,
      avatar: target.avatar || null,
    };
    if (currentUser.id === target.id || currentUser.role === 'admin') {
      updated.email = target.email;
      updated.banned = !!target.banned;
      updated.moderator = !!target.moderator;
    }
    return sendJson(res, 200, updated);
  }

  // GET /api/users/:id/reviews - retrieve all reviews received by a user.
  // Only returns flagged reviews to admin or moderators or the user themselves.
  const userReviewsMatch = pathname.match(/^\/api\/users\/([^\/]+)\/reviews$/);
  if (userReviewsMatch && req.method === 'GET') {
    const targetId = userReviewsMatch[1];
    const currentUser = await authenticate(req);
    // Only allow viewing flagged reviews if admin/moderator/self
    const db = await readDb();
    const target = db.users.find((u) => u.id === targetId);
    if (!target) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    const isAdminOrMod = currentUser && (currentUser.role === 'admin' || currentUser.moderator);
    const isSelf = currentUser && currentUser.id === targetId;
    const reviews = db.reviews
      .filter((r) => r.revieweeId === targetId)
      .filter((r) => {
        if (!r.flagged) return true;
        return isAdminOrMod || isSelf;
      })
      .map((r) => {
        const reviewer = db.users.find((u) => u.id === r.reviewerId) || null;
        return {
          id: r.id,
          jobId: r.jobId,
          reviewerId: r.reviewerId,
          reviewerName: reviewer ? reviewer.name : '',
          rating: r.rating,
          comment: r.comment,
          flagged: r.flagged,
          createdAt: r.createdAt,
        };
      });
    return sendJson(res, 200, reviews);
  }

  // -------------------------------------------------
  // Chat routes

  // GET /api/jobs/:jobId/messages - retrieve messages for a job
  const messagesGetMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/messages$/);
  if (messagesGetMatch && req.method === 'GET') {
    const jobId = messagesGetMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    // Ensure user is allowed: client, assigned freelancer, or admin
    if (
      currentUser.role !== 'admin' &&
      job.clientId !== currentUser.id &&
      job.assignedFreelancerId !== currentUser.id
    ) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    const messages = db.messages.filter((m) => m.jobId === jobId);
    // Ensure reactions property exists on each message
    let updated = false;
    for (const msg of messages) {
      if (!msg.reactions || typeof msg.reactions !== 'object') {
        msg.reactions = {};
        updated = true;
      }
    }
    if (updated) {
      await writeDb(db);
    }
    // Sort by creation time
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return sendJson(res, 200, messages);
  }

  // POST /api/jobs/:jobId/messages - send a new message
  const messagesPostMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/messages$/);
  if (messagesPostMatch && req.method === 'POST') {
    const jobId = messagesPostMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    // Only job owner, assigned freelancer or admin can send messages
    if (
      currentUser.role !== 'admin' &&
      job.clientId !== currentUser.id &&
      job.assignedFreelancerId !== currentUser.id
    ) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    const { text } = await getBody();
    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendJson(res, 400, { error: 'Text is required' });
    }
    const message = {
      id: generateId(),
      jobId,
      senderId: currentUser.id,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      // Track reactions per user
      reactions: {},
    };
    db.messages.push(message);
    await writeDb(db);
    live.publish([currentUser.id, job.clientId, job.assignedFreelancerId]);
    return sendJson(res, 201, message);
  }

  // POST /api/jobs/:jobId/messages/:msgId/react - toggle heart reaction on a job chat message
  const jobMsgReactMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/messages\/([^\/]+)\/react$/);
  if (jobMsgReactMatch && req.method === 'POST') {
    const jobId = jobMsgReactMatch[1];
    const msgId = jobMsgReactMatch[2];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    // Only participants or admin can react
    if (
      currentUser.role !== 'admin' &&
      job.clientId !== currentUser.id &&
      job.assignedFreelancerId !== currentUser.id
    ) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    const msg = db.messages.find((m) => m.id === msgId && m.jobId === jobId);
    if (!msg) {
      return sendJson(res, 404, { error: 'Message not found' });
    }
    if (!msg.reactions || typeof msg.reactions !== 'object') {
      msg.reactions = {};
    }
    if (msg.reactions[currentUser.id]) {
      delete msg.reactions[currentUser.id];
    } else {
      msg.reactions[currentUser.id] = true;
    }
    await writeDb(db);
    live.publish([currentUser.id, job.clientId, job.assignedFreelancerId]);
    return sendJson(res, 200, { id: msg.id, reactions: msg.reactions });
  }

  // -------------------------------------------------
  // Post (gig social) routes

  // GET /api/posts - list posts sorted by newest first.  Non-admin/moderator users
  // see only unflagged posts.
  if (pathname === '/api/posts' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    const db = await readDb();
    let posts = db.posts.slice();
    // Filter flagged posts for non‑admins and non‑moderators
    if (!currentUser || (currentUser.role !== 'admin' && !currentUser.moderator)) {
      posts = posts.filter((p) => !p.flagged);
    }
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, posts);
  }

  // POST /api/posts - create a new post.  Requires authentication.  Accepts
  // content and optional imageBase64.
  if (pathname === '/api/posts' && req.method === 'POST') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    try {
      const { content, imageBase64 } = await getBody();
      if (!content || typeof content !== 'string' || !content.trim()) {
        return sendJson(res, 400, { error: 'Content is required' });
      }
      const db = await readDb();
      const flagged = containsBannedWords(content);
      const imagePath = await saveImage(imageBase64);
      if (imageBase64 && !imagePath) return sendJson(res, 400, { error: 'Choose a PNG, JPEG or WebP image up to 5 MB' });
      const post = {
        id: generateId(),
        userId: currentUser.id,
        content: content.trim(),
        image: imagePath,
        flagged,
        createdAt: new Date().toISOString(),
        // track hearts on posts
        reactions: {},
      };
      db.posts.push(post);
      await writeDb(db);
      return sendJson(res, 201, post);
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to create post' });
    }
  }

  // GET /api/posts/:id - get a single post and its comments.  Non-admin/moderator
  // users cannot retrieve flagged posts.
  const postMatch = pathname.match(/^\/api\/posts\/([^\/]+)$/);
  if (postMatch && req.method === 'GET') {
    const postId = postMatch[1];
    const currentUser = await authenticate(req);
    const db = await readDb();
    const post = db.posts.find((p) => p.id === postId);
    if (!post) {
      return sendJson(res, 404, { error: 'Post not found' });
    }
    // Hide flagged posts from non-admin/moderator
    if (post.flagged && (!currentUser || (currentUser.role !== 'admin' && !currentUser.moderator))) {
      return sendJson(res, 403, { error: 'Post is not available' });
    }
    let comments = db.postComments.filter((c) => c.postId === postId);
    // Filter flagged comments
    if (!currentUser || (currentUser.role !== 'admin' && !currentUser.moderator)) {
      comments = comments.filter((c) => !c.flagged);
    }
    comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return sendJson(res, 200, { ...post, comments });
  }

  // POST /api/posts/:id/comments - add a comment to a post.  Requires authentication.
  const postCommentMatch = pathname.match(/^\/api\/posts\/([^\/]+)\/comments$/);
  if (postCommentMatch && req.method === 'POST') {
    const postId = postCommentMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    try {
      const { content } = await getBody();
      if (!content || typeof content !== 'string' || !content.trim()) {
        return sendJson(res, 400, { error: 'Content is required' });
      }
      const db = await readDb();
      const post = db.posts.find((p) => p.id === postId);
      if (!post) {
        return sendJson(res, 404, { error: 'Post not found' });
      }
      // Do not allow commenting on flagged posts for regular users
      if (post.flagged && (currentUser.role !== 'admin' && !currentUser.moderator)) {
        return sendJson(res, 403, { error: 'Cannot comment on a flagged post' });
      }
      const flagged = containsBannedWords(content);
      const comment = {
        id: generateId(),
        postId,
        userId: currentUser.id,
        content: content.trim(),
        flagged,
        createdAt: new Date().toISOString(),
        // track hearts on comments
        reactions: {},
      };
      db.postComments.push(comment);
      // Send notification to post owner (unless commenting own post)
      if (post.userId !== currentUser.id) {
        const dm = {
          id: generateId(),
          senderId: currentUser.id,
          recipientId: post.userId,
          text: `${currentUser.name || 'Someone'} commented on your post.`,
          createdAt: new Date().toISOString(),
          seen: false,
          reactions: {},
          type: 'notification',
          linkType: 'post',
          linkId: postId,
        };
        if (!db.dms) db.dms = [];
        db.dms.push(dm);
      }
      await writeDb(db);
      return sendJson(res, 201, comment);
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to add comment' });
    }
  }
  // -------------------------------------------------
  // Direct message routes

  // GET /api/dm/:otherId/messages - retrieve direct messages between two users
  const dmGetMatch = pathname.match(/^\/api\/dm\/([^\/]+)\/messages$/);
  if (dmGetMatch && req.method === 'GET') {
    const otherId = dmGetMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    // Only allow messages between the current user and otherId
    // Only include direct messages (exclude notification type) between the two users
    const relevant = db.dms.filter(
      (m) =>
        m.type !== 'notification' &&
        ((m.senderId === currentUser.id && m.recipientId === otherId) ||
          (m.senderId === otherId && m.recipientId === currentUser.id))
    );
    // Mark messages as seen if the current user is the recipient and they were unseen
    let updated = false;
    for (const msg of relevant) {
      // ensure reactions object exists
      if (!msg.reactions || typeof msg.reactions !== 'object') {
        msg.reactions = {};
        updated = true;
      }
      if (msg.recipientId === currentUser.id && msg.seen === false) {
        msg.seen = true;
        updated = true;
      }
    }
    if (updated) {
      await writeDb(db);
    }
    // Sort by creation time ascending
    relevant.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return sendJson(res, 200, relevant);
  }

  // POST /api/dm/:otherId/messages - send a direct message
  const dmPostMatch = pathname.match(/^\/api\/dm\/([^\/]+)\/messages$/);
  if (dmPostMatch && req.method === 'POST') {
    const otherId = dmPostMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const { text } = await getBody();
    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendJson(res, 400, { error: 'Text is required' });
    }
    const db = await readDb();
    // Ensure recipient exists
    const recipient = db.users.find((u) => u.id === otherId);
    if (!recipient) {
      return sendJson(res, 404, { error: 'User not found' });
    }
    const message = {
      id: generateId(),
      senderId: currentUser.id,
      recipientId: otherId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      // track whether the recipient has seen this message yet
      seen: false,
      // map of userId→boolean for reactions (hearts).  Empty initially
      reactions: {},
      type: 'dm',
    };
    db.dms.push(message);
    await writeDb(db);
    live.publish([currentUser.id, otherId]);
    return sendJson(res, 201, message);
  }

  // GET /api/dm/unreadCount - return count of unseen direct messages for current user
  if (pathname === '/api/dm/unreadCount' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    // Count messages where current user is recipient and seen === false
    const count = db.dms.reduce((acc, m) => {
      if (m.type !== 'notification' && m.recipientId === currentUser.id && m.seen === false) {
        return acc + 1;
      }
      return acc;
    }, 0);
    return sendJson(res, 200, { count });
  }

  // POST /api/dm/:otherId/messages/:msgId/react - toggle heart reaction on a DM message
  const dmReactMatch = pathname.match(/^\/api\/dm\/([^\/]+)\/messages\/([^\/]+)\/react$/);
  if (dmReactMatch && req.method === 'POST') {
    const otherId = dmReactMatch[1];
    const msgId = dmReactMatch[2];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const msg = db.dms.find((m) => m.id === msgId && ((m.senderId === currentUser.id && m.recipientId === otherId) || (m.senderId === otherId && m.recipientId === currentUser.id)));
    if (!msg) {
      return sendJson(res, 404, { error: 'Message not found' });
    }
    // ensure reactions object exists
    if (!msg.reactions || typeof msg.reactions !== 'object') {
      msg.reactions = {};
    }
    // Toggle reaction by user: if already reacted, remove; else add
    if (msg.reactions[currentUser.id]) {
      delete msg.reactions[currentUser.id];
    } else {
      msg.reactions[currentUser.id] = true;
    }
    await writeDb(db);
    live.publish([currentUser.id, otherId]);
    return sendJson(res, 200, { id: msg.id, reactions: msg.reactions });
  }

  // GET /api/dm/conversations - list DM conversations with last message and unread count
  if (pathname === '/api/dm/conversations' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    // Build a map of other user -> { lastMessage, unreadCount }
    const convoMap = {};
    for (const msg of db.dms) {
      if (msg.senderId !== currentUser.id && msg.recipientId !== currentUser.id) continue;
      // Skip notifications when building conversation list
      if (msg.type === 'notification') continue;
      const otherId = msg.senderId === currentUser.id ? msg.recipientId : msg.senderId;
      if (!convoMap[otherId]) {
        convoMap[otherId] = { lastMessage: null, unreadCount: 0 };
      }
      // Update last message if this message is newer
      if (!convoMap[otherId].lastMessage || new Date(msg.createdAt) > new Date(convoMap[otherId].lastMessage.createdAt)) {
        convoMap[otherId].lastMessage = msg;
      }
      // Count unread messages where current user is recipient and has not seen
      if (msg.recipientId === currentUser.id && msg.seen === false) {
        convoMap[otherId].unreadCount++;
      }
    }
    // Build result array
    const conversations = [];
    for (const otherId of Object.keys(convoMap)) {
      const otherUser = db.users.find((u) => u.id === otherId);
      if (!otherUser) continue;
      conversations.push({
        otherId,
        otherName: otherUser.name,
        otherAvatar: otherUser.avatar || null,
        lastMessage: convoMap[otherId].lastMessage,
        unreadCount: convoMap[otherId].unreadCount,
      });
    }
    // Sort by last message time descending
    conversations.sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
      return bTime - aTime;
    });
    return sendJson(res, 200, conversations);
  }

  // ---------------------------------------
  // Notifications API

  // GET /api/notifications - list notification messages for the current user
  if (pathname === '/api/notifications' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const notifications = db.dms
      .filter((m) => m.type === 'notification' && m.recipientId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, notifications);
  }

  // GET /api/notifications/unreadCount - number of unseen notifications for current user
  if (pathname === '/api/notifications/unreadCount' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const count = db.dms.reduce((acc, m) => {
      if (m.type === 'notification' && m.recipientId === currentUser.id && m.seen === false) {
        return acc + 1;
      }
      return acc;
    }, 0);
    return sendJson(res, 200, { count });
  }

  // PUT /api/notifications/:id/seen - mark a notification as seen
  const notifSeenMatch = pathname.match(/^\/api\/notifications\/([^\/]+)\/seen$/);
  if (notifSeenMatch && req.method === 'PUT') {
    const notifId = notifSeenMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const msg = db.dms.find((m) => m.id === notifId && m.recipientId === currentUser.id);
    if (!msg || msg.type !== 'notification') {
      return sendJson(res, 404, { error: 'Notification not found' });
    }
    msg.seen = true;
    await writeDb(db);
    return sendJson(res, 200, { id: msg.id, seen: true });
  }

  // POST /api/posts/:id/react - toggle heart reaction on a post
  const postReactMatch = pathname.match(/^\/api\/posts\/([^\/]+)\/react$/);
  if (postReactMatch && req.method === 'POST') {
    const postId = postReactMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const post = db.posts.find((p) => p.id === postId);
    if (!post) {
      return sendJson(res, 404, { error: 'Post not found' });
    }
    // Do not allow reacting to flagged posts for regular users
    if (post.flagged && (currentUser.role !== 'admin' && !currentUser.moderator)) {
      return sendJson(res, 403, { error: 'Cannot react to a flagged post' });
    }
    if (!post.reactions || typeof post.reactions !== 'object') {
      post.reactions = {};
    }
    let added = false;
    if (post.reactions[currentUser.id]) {
      delete post.reactions[currentUser.id];
    } else {
      post.reactions[currentUser.id] = true;
      added = true;
    }
    // If reaction was added and the reactor is not the owner, send notification
    if (added && post.userId !== currentUser.id) {
      const dm = {
        id: generateId(),
        senderId: currentUser.id,
        recipientId: post.userId,
        text: `${currentUser.name || 'Someone'} reacted to your post.`,
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
        type: 'notification',
        linkType: 'post',
        linkId: postId,
      };
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    }
    await writeDb(db);
    return sendJson(res, 200, { id: post.id, reactions: post.reactions });
  }

  // POST /api/posts/:postId/comments/:commentId/react - toggle heart reaction on a comment
  const postCommentReactMatch = pathname.match(/^\/api\/posts\/([^\/]+)\/comments\/([^\/]+)\/react$/);
  if (postCommentReactMatch && req.method === 'POST') {
    const postId = postCommentReactMatch[1];
    const commentId = postCommentReactMatch[2];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const post = db.posts.find((p) => p.id === postId);
    if (!post) {
      return sendJson(res, 404, { error: 'Post not found' });
    }
    const comment = db.postComments.find((c) => c.id === commentId && c.postId === postId);
    if (!comment) {
      return sendJson(res, 404, { error: 'Comment not found' });
    }
    // Do not allow reacting to flagged posts/comments for regular users
    if ((post.flagged || comment.flagged) && (currentUser.role !== 'admin' && !currentUser.moderator)) {
      return sendJson(res, 403, { error: 'Cannot react to a flagged comment' });
    }
    if (!comment.reactions || typeof comment.reactions !== 'object') {
      comment.reactions = {};
    }
    let added = false;
    if (comment.reactions[currentUser.id]) {
      delete comment.reactions[currentUser.id];
    } else {
      comment.reactions[currentUser.id] = true;
      added = true;
    }
    // If reaction was added and the reactor is not the comment owner, send notification
    if (added && comment.userId !== currentUser.id) {
      const dm = {
        id: generateId(),
        senderId: currentUser.id,
        recipientId: comment.userId,
        text: `${currentUser.name || 'Someone'} reacted to your comment.`,
        createdAt: new Date().toISOString(),
        seen: false,
        reactions: {},
        type: 'notification',
        linkType: 'post',
        linkId: postId,
      };
      if (!db.dms) db.dms = [];
      db.dms.push(dm);
    }
    await writeDb(db);
    return sendJson(res, 200, { id: comment.id, reactions: comment.reactions });
  }

  // DELETE /api/posts/:id - delete a post.  Only the owner, admins or moderators may delete.
  const postDeletePathMatch = pathname.match(/^\/api\/posts\/([^\/]+)$/);
  if (postDeletePathMatch && req.method === 'DELETE') {
    const postId = postDeletePathMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const postIndex = db.posts.findIndex((p) => p.id === postId);
    if (postIndex === -1) {
      return sendJson(res, 404, { error: 'Post not found' });
    }
    const post = db.posts[postIndex];
    // Only owner, admin or moderator may delete
    const allowed = currentUser.id === post.userId || currentUser.role === 'admin' || currentUser.moderator;
    if (!allowed) {
      return sendJson(res, 403, { error: 'You do not have permission to delete this post' });
    }
    // Extract optional reason from query parameter
    const reason = parsedUrl.searchParams.get('reason') || '';
    // Remove post and its comments
    db.posts.splice(postIndex, 1);
    db.postComments = db.postComments.filter((c) => c.postId !== postId);
    // If the deleter is not the owner, send notification to the owner
    if (currentUser.id !== post.userId) {
      try {
        const dm = {
          id: generateId(),
          senderId: currentUser.id,
          recipientId: post.userId,
          text: reason
            ? `Your post was removed by an administrator/moderator. Reason: ${reason}`
            : 'Your post was removed by an administrator/moderator.',
          createdAt: new Date().toISOString(),
          seen: false,
          reactions: {},
          type: 'notification',
          linkType: 'post',
          linkId: postId,
        };
        if (!db.dms) db.dms = [];
        db.dms.push(dm);
      } catch (e) {
        // ignore DM errors
      }
    }
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  // -----------------------
  // Ticket system
  // -----------------------
  // POST /api/tickets - open a new support ticket. Requires authentication. Body: { subject, message }
  if (pathname === '/api/tickets' && req.method === 'POST') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    try {
      const { subject, message } = await getBody();
      if (typeof subject !== 'string' || !subject.trim() || subject.length > 160 ||
          typeof message !== 'string' || !message.trim() || message.length > 8000) {
        return sendJson(res, 400, { error: 'Subject and message are required' });
      }
      const db = await readDb();
      const ticket = {
        id: generateId(),
        userId: currentUser.id,
        subject: subject.trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
        closedAt: null,
      };
      db.tickets.push(ticket);
      const msg = {
        id: generateId(),
        ticketId: ticket.id,
        senderId: currentUser.id,
        senderRole: 'user',
        text: message,
        createdAt: new Date().toISOString(),
      };
      db.ticketMessages.push(msg);
      // Notify all moderators and admins of new ticket
      for (const u of db.users) {
        if (u.role === 'admin' || u.moderator) {
          const dm = {
            id: generateId(),
            senderId: currentUser.id,
            recipientId: u.id,
            text: `${currentUser.name || 'A user'} opened a support ticket: ${subject}`,
            createdAt: new Date().toISOString(),
            seen: false,
            type: 'notification',
            linkType: 'ticket',
            linkId: ticket.id,
            reactions: {},
          };
          db.dms.push(dm);
        }
      }
      await writeDb(db);
      live.publish([ticket.userId, ...db.users.filter((entry) => !entry.banned && (entry.moderator || entry.role === 'admin')).map((entry) => entry.id)]);
      return sendJson(res, 201, ticket);
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to create ticket' });
    }
  }

  // GET /api/tickets - list tickets accessible to current user
  if (pathname === '/api/tickets' && req.method === 'GET') {
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    let tickets;
    if (currentUser.role === 'admin' || currentUser.moderator) {
      // Admins and mods see all tickets
      tickets = db.tickets;
    } else {
      // Users see only their tickets
      tickets = db.tickets.filter((t) => t.userId === currentUser.id);
    }
    return sendJson(res, 200, tickets);
  }

  // GET /api/tickets/:id - get a single ticket
  const ticketMatch = pathname.match(/^\/api\/tickets\/([^\/]+)$/);
  if (ticketMatch && req.method === 'GET') {
    const ticketId = ticketMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const ticket = db.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return sendJson(res, 404, { error: 'Ticket not found' });
    }
    if (ticket.userId !== currentUser.id && currentUser.role !== 'admin' && !currentUser.moderator) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    return sendJson(res, 200, ticket);
  }

  // GET /api/tickets/:id/messages - list messages for a ticket
  const ticketMsgsMatch = pathname.match(/^\/api\/tickets\/([^\/]+)\/messages$/);
  if (ticketMsgsMatch && req.method === 'GET') {
    const ticketId = ticketMsgsMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const ticket = db.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return sendJson(res, 404, { error: 'Ticket not found' });
    }
    if (ticket.userId !== currentUser.id && currentUser.role !== 'admin' && !currentUser.moderator) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    const messages = db.ticketMessages
      .filter((m) => m.ticketId === ticketId)
      .map((m) => {
        const sender = db.users.find((u) => u.id === m.senderId);
        const staff = m.senderId !== ticket.userId && ['admin', 'moderator'].includes(m.senderRole);
        const senderDisplay = staff ? (m.senderRole === 'admin' ? 'ADMIN' : 'MOD') : sender?.name || 'Unknown';
        const { senderId, ...message } = m;
        return { ...message, ...(staff && currentUser.id !== senderId ? {} : { senderId }), senderDisplay };
      });
    return sendJson(res, 200, messages);
  }

  // POST /api/tickets/:id/messages - add a message to a ticket
  const ticketMsgPostMatch = pathname.match(/^\/api\/tickets\/([^\/]+)\/messages$/);
  if (ticketMsgPostMatch && req.method === 'POST') {
    const ticketId = ticketMsgPostMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const { text } = await getBody();
    if (typeof text !== 'string' || !text.trim() || text.length > 8000) {
      return sendJson(res, 400, { error: 'Message text is required' });
    }
    const db = await readDb();
    const ticket = db.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return sendJson(res, 404, { error: 'Ticket not found' });
    }
    if (ticket.userId !== currentUser.id && currentUser.role !== 'admin' && !currentUser.moderator) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    if (ticket.status === 'closed') {
      return sendJson(res, 400, { error: 'Ticket is closed' });
    }
    const msg = {
      id: generateId(),
      ticketId: ticket.id,
      senderId: currentUser.id,
      senderRole: currentUser.role === 'admin'
        ? 'admin'
        : currentUser.moderator
        ? 'moderator'
        : 'user',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    db.ticketMessages.push(msg);
    // Notify participants: if sender is user, notify all admins/mods; if sender is admin/mod, notify ticket owner
    if (msg.senderRole === 'user') {
      for (const u of db.users) {
        if (u.role === 'admin' || u.moderator) {
          const dm = {
            id: generateId(),
            senderId: currentUser.id,
            recipientId: u.id,
            text: `${currentUser.name || 'A user'} replied in ticket: ${ticket.subject}`,
            createdAt: new Date().toISOString(),
            seen: false,
            type: 'notification',
            linkType: 'ticket',
            linkId: ticket.id,
            reactions: {},
          };
          db.dms.push(dm);
        }
      }
    } else {
      // sender is admin or moderator; notify ticket owner
      const recipient = db.users.find((u) => u.id === ticket.userId);
      if (recipient) {
        const dm = {
          id: generateId(),
          senderId: currentUser.id,
          recipientId: recipient.id,
          text: `Your ticket "${ticket.subject}" has a new reply`,
          createdAt: new Date().toISOString(),
          seen: false,
          type: 'notification',
          linkType: 'ticket',
          linkId: ticket.id,
          reactions: {},
        };
        db.dms.push(dm);
      }
    }
    await writeDb(db);
    live.publish([ticket.userId, ...db.users.filter((entry) => !entry.banned && (entry.moderator || entry.role === 'admin')).map((entry) => entry.id)]);
    return sendJson(res, 201, msg);
  }

  // PUT /api/tickets/:id/close - close a ticket.  Admins, moderators or the ticket owner can close
  const ticketCloseMatch = pathname.match(/^\/api\/tickets\/([^\/]+)\/close$/);
  if (ticketCloseMatch && req.method === 'PUT') {
    const ticketId = ticketCloseMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const ticket = db.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return sendJson(res, 404, { error: 'Ticket not found' });
    }
    if (ticket.userId !== currentUser.id && currentUser.role !== 'admin' && !currentUser.moderator) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    if (ticket.status === 'closed') {
      return sendJson(res, 400, { error: 'Ticket is already closed' });
    }
    ticket.status = 'closed';
    ticket.closedAt = new Date().toISOString();
    // Notify participants of closure: send to mods/admins if closed by user; send to user if closed by mod/admin
    if (currentUser.id === ticket.userId) {
      for (const u of db.users) {
        if (u.role === 'admin' || u.moderator) {
          const dm = {
            id: generateId(),
            senderId: currentUser.id,
            recipientId: u.id,
            text: `${currentUser.name || 'A user'} closed ticket: ${ticket.subject}`,
            createdAt: new Date().toISOString(),
            seen: false,
            type: 'notification',
            linkType: 'ticket',
            linkId: ticket.id,
            reactions: {},
          };
          db.dms.push(dm);
        }
      }
    } else {
      const recipient = db.users.find((u) => u.id === ticket.userId);
      if (recipient) {
        const dm = {
          id: generateId(),
          senderId: currentUser.id,
          recipientId: recipient.id,
          text: `Your ticket "${ticket.subject}" has been closed`,
          createdAt: new Date().toISOString(),
          seen: false,
          type: 'notification',
          linkType: 'ticket',
          linkId: ticket.id,
          reactions: {},
        };
        db.dms.push(dm);
      }
    }
    await writeDb(db);
    live.publish([ticket.userId, ...db.users.filter((entry) => !entry.banned && (entry.moderator || entry.role === 'admin')).map((entry) => entry.id)]);
    return sendJson(res, 200, ticket);
  }

  // POST /api/posts/:id/report - report a post.  Any authenticated user can report a post.  Sets flagged = true and notifies admins and moderators.
  const postReportMatch = pathname.match(/^\/api\/posts\/([^\/]+)\/report$/);
  if (postReportMatch && req.method === 'POST') {
    const postId = postReportMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const db = await readDb();
    const post = db.posts.find((p) => p.id === postId);
    if (!post) {
      return sendJson(res, 404, { error: 'Post not found' });
    }
    // Flag the post
    post.flagged = true;
    // Notify post owner if reporter is not owner
    if (currentUser.id !== post.userId) {
      try {
        const dm = {
          id: generateId(),
          senderId: currentUser.id,
          recipientId: post.userId,
          text: 'Your post has been reported by another user and will be reviewed.',
          createdAt: new Date().toISOString(),
          seen: false,
          reactions: {},
          type: 'notification',
          linkType: 'post',
          linkId: postId,
        };
        if (!db.dms) db.dms = [];
        db.dms.push(dm);
      } catch (e) {}
    }
    // Notify all admins and moderators
    try {
      const now = new Date().toISOString();
      for (const u of db.users) {
        if (u.role === 'admin' || u.moderator) {
          const dm = {
            id: generateId(),
            senderId: currentUser.id,
            recipientId: u.id,
            text: 'A post has been reported and requires your review.',
            createdAt: now,
            seen: false,
            reactions: {},
            type: 'notification',
            linkType: 'post',
            linkId: postId,
          };
          if (!db.dms) db.dms = [];
          db.dms.push(dm);
        }
      }
    } catch (e) {}
    await writeDb(db);
    return sendJson(res, 200, { success: true });
  }

  // -------------------------------------------------
  // Admin job update route

  // PUT /api/admin/jobs/:id - update job details.  Admin only.
  const adminJobUpdateMatch = pathname.match(/^\/api\/admin\/jobs\/([^\/]+)$/);
  if (adminJobUpdateMatch && req.method === 'PUT') {
    const jobId = adminJobUpdateMatch[1];
    const currentUser = await authenticate(req);
    if (!currentUser || !hasRole(currentUser, 'admin')) {
      return sendJson(res, 401, { error: 'Unauthorised' });
    }
    const updates = await getBody();
    const db = await readDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found' });
    }
    // Update fields if provided
    if (updates.title !== undefined) job.title = updates.title;
    if (updates.description !== undefined) job.description = updates.description;
    if (updates.budget !== undefined) job.budget = updates.budget;
    if (updates.currency !== undefined) job.currency = updates.currency;
    if (updates.deadline !== undefined) job.deadline = updates.deadline;
    if (updates.flagged !== undefined) {
      job.flagged = !!updates.flagged;
      if (!job.flagged && job.status === 'flagged') {
        job.status = 'open';
      }
    }
    // Status updates: only allow valid transitions
    if (updates.status !== undefined) {
      const allowed = ['open', 'assigned', 'completed', 'flagged'];
      if (allowed.includes(updates.status)) {
        job.status = updates.status;
      }
    }
    await writeDb(db);
    return sendJson(res, 200, job);
  }

  if (!pathname.startsWith('/api') && ['GET', 'HEAD'].includes(req.method)) {
    const requested = path.resolve(frontendDir, '.' + pathname);
    if (requested === frontendDir || requested.startsWith(frontendDir + path.sep)) {
      const file = (requested !== frontendDir && await serveStatic(requested))
        || (!path.extname(pathname) && await serveStatic(path.join(frontendDir, 'index.html')));
      if (file) {
        res.writeHead(200, { 'Content-Type': file.contentType });
        return res.end(req.method === 'HEAD' ? undefined : file.content);
      }
    }
  }
  sendJson(res, 404, { error: 'Not found' });
}

// Serialize data access in one process. Network uploads and live streams stay outside this queue.
let pending = Promise.resolve();
const server = http.createServer({ requestTimeout: 30000 }, async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/events' && req.method === 'GET') {
      const db = await readDb();
      const token = tokenRecord(db, req.headers.authorization);
      const user = token && db.users.find((entry) => entry.id === token.userId && !entry.banned);
      if (!user) return sendJson(res, 401, { error: 'Unauthorised' });
      return live.subscribe(res, user.id, token.expiresAt);
    }
    if (!pathname.startsWith('/api/')) return await handleRequest(req, res, pathname);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      let length = 0;
      const chunks = [];
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > 8 * 1024 * 1024) {
          res.setHeader('Connection', 'close');
          return sendJson(res, 413, { error: 'Request is too large' });
        }
        chunks.push(chunk);
      }
      req.rawBody = Buffer.concat(chunks);
      if (length && pathname !== '/api/payments/stripe/webhook') {
        try {
          req.body = JSON.parse(req.rawBody.toString('utf8'));
          if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error();
        } catch {
          return sendJson(res, 400, { error: 'Expected a JSON object' });
        }
      }
    }
    const job = pending.then(() => handleRequest(req, res, pathname));
    pending = job.catch(() => {});
    await job;
  } catch (error) {
    console.error('GoGig request failed', error.code || error.name);
    if (!res.headersSent && !res.destroyed) sendJson(res, 500, { error: 'Request could not be completed' });
    else if (!res.writableEnded) res.end();
  }
});

const port = Number(process.env.PORT || 5000);
readDb().then(() => {
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`GoGig listening on http://${process.env.HOST || '127.0.0.1'}:${port}`);
  });
}).catch((error) => {
  console.error('GoGig could not read its database:', error.message);
  process.exitCode = 1;
});
