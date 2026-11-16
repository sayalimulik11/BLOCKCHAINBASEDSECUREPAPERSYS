# FB-01: Participants page requests limit=250, backend max is 100

File: frontend/src/hooks/useParticipants.ts
Lines: 257, 258, 266
Failing value: limit=250
Backend rule: backend/src/routes/events.ts MAX_LIMIT=100; returns 400 "limit must be an integer between 1 and 100".

Fix: request at most 100 per call and loop with cursor until all events fetched.
\\\diff
- requestJson(... '/api/events?type=ParticipantRegistered&limit=250'),
- requestJson(... '/api/events?type=ParticipantRevoked&limit=250'),
+ requestJson(... '/api/events?type=ParticipantRegistered&limit=100'),
+ requestJson(... '/api/events?type=ParticipantRevoked&limit=100'),
\\\
Also change default limit from 250 to 100.

## Report 2: payload shape mismatch
Hook reads payload.account/payload.role (object keys) but backend returns positional array [address, roleNumber, profileHash]. Fix: read payload[0], payload[1], payload[2]; parse numeric role strings.
