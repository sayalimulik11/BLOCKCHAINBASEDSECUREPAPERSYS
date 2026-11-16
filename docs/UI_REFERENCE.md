# Approved UI Reference (Security Paper Design Language)

APPROVED UI REFERENCE (security paper design language)
Colours (use section 10.3 values; if they differ from these, section 10.3 wins and tell me): mist #E7EDEA page, sheet #F9FBFA panels, ink #0F2740 text and primary, slate #566A7B secondary text, hairline #C3D0CB borders, marigold #E59A0E current and focus, verified #1D7A57, alert #B03A2E, pending #2C5D8F.
Shell: top bar, not a sidebar. Left: SIGIL wordmark, then role-aware nav links (Docket, Create exam, Participants, Audit log, etc. by role). Right: chips for role plus short address in mono, network, chain time, pending transaction count. Content max width 1200px.
Exam page (Option B): header row with a 52px Rosette on the left, serial in mono (No. 0007) over the title in slate, and the state stamp on the right (2px coloured border, rotated about -4deg, sentence case). Below it a HORIZONTAL custody strip: round bubbles with labels joined by hairlines (filled ink = done, 3px marigold ring = current, hairline outline = pending). Below that a grid, about 1.6fr and 1fr: full-width readiness table on the left, dashed Coupon panel on the right. Use the real state names from sections 5 and 7.
Tables: hairline row dividers, header text slate, 11 to 12px, mono numerals, 0 radius, custody bubbles inline in docket rows.
Buttons: ink fill, sheet text, 3px radius; secondary is an ink outline. Coupon: 1.5px dashed ink border on sheet, title with "(permanent)" for irreversible actions, one plain sentence on the consequence, button. The button is dimmed with a visible reason until its prerequisite is met.
ThresholdMeter: SQUARE notches (16px) so it reads differently from the round bubbles. CountdownLock: mono 20px time with a marigold square.
Guard screens: one full-screen card per state (sign in, connect wallet, wrong network with an alert-coloured border, no role showing the address).
Create exam: inside the page, a 150px left step list with bubbles (Details, Sections and quotas, Schedule, Panel and threshold, Setters and centres, Review and sign) and the form on the right; holder rows show "Key registered" or an inline error.
Key ceremony: heading, one line "This runs in your browser. The exam private key is never sent or stored.", a vertical bubble progress list, then the Open collection Coupon.
Question Composer: two columns, form on the left, import check table (row, column, problem) and a 6px quota progress bar on the right.
Release console: two columns, countdown plus ThresholdMeter on the left, Coupon with the passphrase field on the right.
Rules: sentence case, no gradients, no glassmorphism, no emoji icons, no rows of identical rounded cards, one shadow only (popovers and dialogs).
