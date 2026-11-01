// Bangla UI text -> English. Run from the project root: node translate-ui.cjs
const fs = require("fs");
const path = require("path");

const PAIRS = [
  // ---------- TaskForm ----------
  ['টি বাছাই করা', ' selected'],
  ['skill তালিকা তৈরি হচ্ছে…', 'Preparing skill list…'],
  ['Skill খুঁজুন, না পেলে নতুন নাম লিখে যোগ করুন', 'Search skills, or type a new name to add it'],
  ['+ "{q.trim()}" যোগ করুন', '+ Add "{q.trim()}"'],
  ['একটি category বাছুন (যেমন Frontend), অথবা ওপরে skill খুঁজুন।', 'Pick a category (e.g. Frontend), or search for a skill above.'],
  ['এই নামে কোনো skill নেই, ওপরের বাটনে চাপলে নতুন হিসেবে যোগ হবে।', 'No skill with this name. Use the button above to add it as a new skill.'],
  ['"${name}" skill যোগ হয়েছে', 'Skill "${name}" added'],
  ['অন্যান্য / কাস্টম', 'Other / Custom'],
  ['বিবরণ (ঐচ্ছিক)', 'Description (optional)'],
  ['যেমন Frontend', 'e.g. Frontend'],
  ['আপডেট করুন', 'Update'],
  ['তৈরি করুন', 'Create'],
  ['টাস্ক আপডেট হয়েছে', 'Task updated'],
  ['টাস্ক তৈরি হয়েছে', 'Task created'],

  // ---------- Manager ----------
  ['আপনার নামে কোনো member বরাদ্দ নেই, তাই সব সক্রিয় member দেখানো হচ্ছে। Admin "Users" থেকে member-দের আপনার (Manager) নামে দিলে এখানে শুধু আপনার টিম দেখাবে।', 'No members are assigned to you, so all active members are shown. Once an Admin assigns members to you under Users, only your team will appear here.'],
  ['কোনো আসন্ন deadline নেই', 'No upcoming deadlines'],
  ['আসন্ন deadline', 'Upcoming deadlines'],
  ['"আজই"', '"today"'],
  ['"আজ"', '"Today"'],
  ['${dl} দিন', '${dl} days'],
  ['সাম্প্রতিক alert', 'Recent alerts'],
  ['সাম্প্রতিক notification', 'Recent notifications'],
  ['সব দেখুন', 'View all'],
  ['কোনো alert নেই', 'No alerts'],
  ['কোনো member নেই', 'No members'],
  ['কোনো skill সেট করা নেই', 'No skills set'],
  ['কোনো skill সেট নেই', 'No skills set'],
  ['কোনো skill নেই', 'No skills'],
  ['skill নেই', 'no skills'],
  ['"আসন্ন ছুটি"', '"Upcoming leave"'],
  ['"ছুটিতে"', '"On leave"'],
  ['"বন্ধ"', '"Close"'],
  ['বন্ধ করুন', 'Close'],
  ['মোট টাস্ক', 'Total tasks'],
  ['<dt>সম্পন্ন</dt>', '<dt>Completed</dt>'],
  ['সময়মতো / দেরিতে', 'On time / Late'],
  ['চলমান টাস্ক', 'Active tasks'],
  ['>নেই</li>', '>None</li>'],
  ['>ছুটি</h4>', '>Leave</h4>'],
  ['+ নতুন টাস্ক', '+ New task'],
  ['টিমে কোনো যোগ্য সদস্য পাওয়া যায়নি (skill বা ছুটি দেখুন)', 'No eligible member found in your team (check skills or leave)'],
  ['Auto-assign সম্পন্ন', 'Auto-assign done'],
  ['Reassign হয়েছে', 'Reassigned'],
  ['Assign হয়েছে', 'Assigned'],
  ['(ছুটিতে)', '(on leave)'],
  ['(⚠ বেশি কাজ)', '(⚠ heavy workload)'],
  ['"${t.title}" বাতিল করবেন?', 'Cancel task "${t.title}"?'],
  ['টাস্ক বাতিল হয়েছে', 'Task cancelled'],
  ['"${t.title}" স্থায়ীভাবে মুছবেন?', 'Permanently delete task "${t.title}"?'],
  ['"${t.title}" মুছবেন?', 'Delete task "${t.title}"?'],
  ['টাস্ক মোছা হয়েছে', 'Task deleted'],
  ['সুপারিশ', 'suggestions'],
  ['সব যোগ্য member (${list.length})', 'All eligible members (${list.length})'],
  ['লুকান', 'Hide'],
  ['এখানে কোনো টাস্ক নেই', 'No tasks here'],
  ['কোনো টাস্ক নেই', 'No tasks'],
  ['|| "নেই"', '|| "none"'],
  ['এখনো কোনো assignment নেই', 'No assignments yet'],
  ['Member workload ও availability', 'Member workload and availability'],
  ['· ছুটিতে', '· on leave'],
  ['Workload balance প্রস্তাব', 'Workload balance suggestions'],
  ['"প্রস্তাব দেখুন" চাপুন', 'Click "Show suggestions"'],
  ['প্রস্তাব দেখুন', 'Show suggestions'],
  ['যাদের load ৮০%-এর বেশি, তাদের এখনো শুরু না হওয়া টাস্ক কম-load যোগ্য member-কে দেওয়ার প্রস্তাব।', 'Moves not-yet-started tasks from members above 80% load to eligible members with a lower load.'],
  ['এখন কোনো স্থানান্তরের প্রয়োজন নেই ✅', 'No reassignment needed right now ✅'],
  ['স্থানান্তর হয়েছে', 'Task moved'],
  ['কোনো conflict নেই ✅', 'No conflicts ✅'],
  ['হিসাব: সাপ্তাহিক ক্ষমতা ÷ ৭ = দৈনিক ঘণ্টা, ছুটির দিন বাদ। deadline অনুযায়ী জমা কাজ ফাঁকা সময়ের বেশি হলে conflict।', 'Calculation: weekly capacity / 7 = hours per day, leave days excluded. A conflict is reported when the work due by a deadline exceeds the available time.'],
  [') পর্যন্ত মোট ${cum}h কাজ, কিন্তু ফাঁকা সময় ≈ ', ') - total ${cum}h of work due by then, but available time is only ≈ '],
  ['(ছুটি ${leaveDays.toFixed(1)} দিন)', '(leave: ${leaveDays.toFixed(1)} days)'],
  ['"On time/Late" শুধু সেই টাস্কের জন্য, যেগুলোর সম্পন্ন হওয়ার সময় রেকর্ড হয়েছে (এই আপডেটের পর সম্পন্ন)।', '"On time / Late" counts only tasks whose completion time was recorded (tasks completed after this update).'],
  ['সম্পন্ন টাস্ক (', 'Completed tasks ('],
  ['সম্পন্ন টাস্ক', 'Completed tasks'],
  ['এখনো কিছু সম্পন্ন হয়নি', 'Nothing completed yet'],
  ['সময় রেকর্ড নেই', 'No time recorded'],
  ['নতুন বরাদ্দ', 'New assignment'],
  ['এখন ছুটিতে', 'is on leave now'],
  ['শীঘ্রই ছুটিতে', 'will be on leave soon'],
  ['-এর workload', '\'s workload'],
  ['kind: "সম্পন্ন"', 'kind: "Completed"'],
  ['সম্পন্ন করেছেন', 'completed by'],
  ['deadline পেরিয়ে গেছে', 'deadline has passed'],
  ['এগুলো ডাটা থেকে সরাসরি হিসাব করা (গত ৭ দিন ও চলমান অবস্থা)। email notification এখনো নেই।', 'These are calculated directly from the data (last 7 days and current state). Email notifications are not available yet.'],
  ['কোনো notification নেই', 'No notifications'],
  ['"হ্যাঁ"', '"Yes"'],
  ['CSV ডাউনলোড', 'Download CSV'],
  ['এই রিপোর্টে কিছু নেই', 'Nothing in this report'],
  ['লোড হচ্ছে…', 'Loading…'],
  ['Review দরকার', 'Review needed'],
  ['Submit করেছেন', 'submitted'],
  ['Reassign অনুরোধ (', 'Reassign requests ('],
  ['Reassign অনুরোধ পাঠানো হয়েছে, ম্যানেজারের উত্তরের অপেক্ষায়:', 'Reassign request sent, waiting for the manager:'],
  ['Reassign অনুরোধ গ্রহণ হয়নি:', 'Reassign request was not accepted:'],
  ['Reassign অনুরোধ', 'Reassign request'],

  // ---------- Member ----------
  ['kind: "নতুন টাস্ক"', 'kind: "New task"'],
  ['আপনাকে দেওয়া হয়েছে। Accept বা শুরু করুন', 'has been assigned to you. Accept it or start working'],
  ['} বাকি', '} left'],
  ['আপনার কাছ থেকে অন্যকে দেওয়া হয়েছে', 'has been reassigned to someone else'],
  ['${(h / 24).toFixed(1)} দিন', '${(h / 24).toFixed(1)} days'],
  ['${h.toFixed(1)} ঘণ্টা', '${h.toFixed(1)} hours'],
  ['Pending (শুরু হয়নি)', 'Pending (not started)'],
  ['আমার workload', 'My workload'],
  ['${pct(w.util)} ব্যবহৃত', '${pct(w.util)} used'],
  ['ম্যানেজার ফেরত দিয়েছেন:', 'Manager returned this task:'],
  ['কোনো মন্তব্য নেই', 'No comment'],
  ['। সংশোধন করে আবার Submit করুন।', '. Please fix it and submit again.'],
  ['Submit করা হয়েছে, অনুমোদনের অপেক্ষা', 'Submitted, waiting for approval'],
  ['Submit করা হয়েছে (', 'Submitted ('],
  ['), ম্যানেজারের অনুমোদনের অপেক্ষায়।', '), waiting for manager approval.'],
  ['সম্পন্ন:', 'Completed:'],
  ['· সময় লেগেছে', '· took'],
  ['টাস্ক Accept করা হয়েছে', 'Task accepted'],
  ['টাস্ক শুরু হয়েছে', 'Task started'],
  ['শুরু করুন', 'Start'],
  ['অনুরোধ পাঠানো হয়েছে', 'Request sent'],
  ['কেন reassign চান? (কমপক্ষে ৩ অক্ষর)', 'Why do you want a reassignment? (at least 3 characters)'],
  ['Reject / Reassign চাই', 'Reject / Request reassignment'],
  ['বিস্তারিত লুকান', 'Hide details'],
  ['বিস্তারিত', 'Details'],
  ['কেন আমাকে?', 'Why me?'],
  ['Progress আপডেট:', 'Update progress:'],
  ['Progress সেভ হয়েছে', 'Progress saved'],
  ['Progress সেভ', 'Save progress'],
  ['ম্যানেজারের জন্য মন্তব্য (ঐচ্ছিক)', 'Comment for the manager (optional)'],
  ['Submit করুন', 'Submit'],
  ['কোনো বিবরণ নেই', 'No description'],
  ['প্রয়োজনীয় skill', 'Required skills'],
  ['আমার ${mine || "—"})', 'you: ${mine || "—"})'],
  ['কোনো নির্দিষ্ট skill নেই', 'No specific skills required'],
  ['এই টাস্ক ম্যানেজার সরাসরি আপনাকে দিয়েছেন (manual)।', 'The manager assigned this task to you directly (manual).'],
  ['উপযুক্ততার স্কোর:', 'Suitability score:'],
  ['এগুলো ডাটা থেকে সরাসরি হিসাব করা। email বা push notification এখনো নেই।', 'These are calculated directly from the data. Email and push notifications are not available yet.'],
  ['Score হিসাব:', 'Score calculation:'],
  ['৬০% × Completion rate (সম্পন্ন ÷ আমার সব টাস্ক) + ৪০% × On-time rate (সময়মতো ÷ সময় রেকর্ড থাকা সম্পন্ন টাস্ক)।', '60% x Completion rate (completed / all my tasks) + 40% x On-time rate (on time / completed tasks with a recorded time).'],
  ['সম্পন্নের সময় রেকর্ড না থাকলে On-time-এর জায়গায় Completion rate ধরা হয়। এটা allocation-এর স্কোর নয়, শুধু আপনার নিজের অগ্রগতি দেখার জন্য।', 'If no completion time is recorded, Completion rate is used in place of On-time rate. This is not the allocation score; it only tracks your own progress.'],
  ['সময় নেই', 'no time'],
  ['দেরিতে সম্পন্ন (', 'Completed late ('],
  ['কোনো দেরি নেই', 'No late tasks'],
  ['} দেরি', '} late'],
  ['"সময় লেগেছে"', '"Time taken"'],
  ['এখনো কোনো টাস্ক দেওয়া হয়নি', 'No tasks have been assigned to you yet'],
  ['ছুটি যোগ করুন', 'Add leave'],
  ['ছুটি যোগ হয়েছে', 'Leave added'],
  ['ছুটি দিলে নতুন টাস্ক পাওয়ার সম্ভাবনা (Availability স্কোর) কমে।', 'Adding leave lowers your chance of getting new tasks (availability score).'],
  ['past ? "শেষ" : cur ? "চলছে" : "আসন্ন"', 'past ? "Ended" : cur ? "Ongoing" : "Upcoming"'],
  ['"শুরু"', '"Start"'],
  ['"শেষ"', '"End"'],
  ['"অবস্থা"', '"Status"'],
  ['মুছুন', 'Delete'],
  ['ছুটি মোছা হয়েছে', 'Leave deleted'],
  ['কোনো ছুটি নেই', 'No leave'],
  ['যোগ করুন', 'Add'],
  ['আমার তথ্য', 'My information'],
  ['ইমেইল', 'Email'],
  ['সাপ্তাহিক ক্ষমতা', 'Weekly capacity'],
  ['নাম আপডেট হয়েছে', 'Name updated'],
  ['পাসওয়ার্ড বদলান', 'Change password'],
  ['বর্তমান পাসওয়ার্ড', 'Current password'],
  ['নতুন পাসওয়ার্ড (৮+ অক্ষর)', 'New password (8+ characters)'],
  ['নতুন পাসওয়ার্ড আবার', 'Repeat new password'],
  ['নতুন পাসওয়ার্ড দুটো মিলছে না', 'The new passwords do not match'],
  ['পাসওয়ার্ড বদলানো হয়েছে', 'Password changed'],
  ['আমার Skills ও level', 'My skills and levels'],
  ['এই level টাস্ক বরাদ্দের স্কোরে ব্যবহার হয়, তাই সঠিকভাবে দিন। ম্যানেজার এটা যাচাই ও বদলাতে পারেন।', 'This level is used in task allocation scores, so enter it honestly. Your manager can review and change it.'],
  ['Skill যোগ করুন…', 'Add a skill…'],
  ['Skills সেভ হয়েছে', 'Skills saved'],
  ['Skills সেভ করুন', 'Save skills'],
  ['সেভ করুন', 'Save'],
  ['সিস্টেমে এখনো কোনো skill নেই। ম্যানেজার যোগ করলে এখানে আসবে।', 'There are no skills in the system yet. They will appear here once a manager adds some.'],

  // ---------- Review panel ----------
  ['Submit করা টাস্ক (', 'Submitted tasks ('],
  ['review-এর অপেক্ষায় কোনো টাস্ক নেই', 'No tasks waiting for review'],
  ['মন্তব্য (ফেরত দিলে কারণ লিখুন)', 'Comment (give a reason when rejecting)'],
  ['মন্তব্য:', 'Comment:'],
  ['অনুমোদন করা হয়েছে, টাস্ক সম্পন্ন', 'Approved, task completed'],
  ['ফেরত দেওয়া হয়েছে', 'Returned to the member'],
  ['কোনো অনুরোধ নেই', 'No requests'],
  ['কারণ:', 'Reason:'],
  ['অন্য member-কে দিন…', 'Assign to another member…'],
  ['কেন অনুরোধ গ্রহণ হচ্ছে না? (ঐচ্ছিক)', 'Why is the request being declined? (optional)'],
  ['অনুরোধ গ্রহণ করা হয়নি', 'Request declined'],
  ['গ্রহণ করব না', 'Decline'],

  // ---------- Admin ----------
  ['কোনো overdue টাস্ক নেই', 'No overdue tasks'],
  ['ডাটা নেই', 'No data'],
  ['এখনো কিছু নেই', 'Nothing yet'],
  ['নাম বা ইমেইল খুঁজুন', 'Search by name or email'],
  ['+ ইউজার যোগ', '+ Add user'],
  ['পুরো নাম', 'Full name'],
  ['পাসওয়ার্ড (৮+ অক্ষর)', 'Password (8+ characters)'],
  ['Department নেই', 'No department'],
  ['Manager নেই', 'No manager'],
  ['ইউজার তৈরি হয়েছে', 'User created'],
  ['(আপনি)', '(you)'],
  ['${u.name}-এর নতুন পাসওয়ার্ড (৮+ অক্ষর):', 'New password for ${u.name} (8+ characters):'],
  ['${u.name}-কে মুছবেন?', 'Delete ${u.name}?'],
  ['মোছা হয়েছে', 'Deleted'],
  ['নতুন department', 'New department'],
  ['Department তৈরি হয়েছে', 'Department created'],
  ['নতুন নাম:', 'New name:'],
  ['নাম বদলানো হয়েছে', 'Renamed'],
  ['${d.name} মুছবেন?', 'Delete ${d.name}?'],
  ['কাউকে department বা manager-এ দিতে "Users" ট্যাবে তার সারির ড্রপডাউন ব্যবহার করুন।', 'To put someone in a department or under a manager, use the dropdowns in their row on the Users tab.'],
  ['এখনো কোনো কার্যকলাপ নেই', 'No activity yet'],

  // ---------- Team (skills tab) ----------
  ['নতুন skill (যেমন Node.js)', 'New skill (e.g. Node.js)'],
  ['Skill বাছুন', 'Select a skill'],

  // ---------- Backend messages ----------
  ['টাস্ক Submit করুন, ম্যানেজার অনুমোদন করলে সম্পন্ন হবে', 'Submit the task instead; it becomes completed once the manager approves'],
  ['ইনপুট ঠিক নয় (পাসওয়ার্ড কমপক্ষে ৮ অক্ষর)', 'Invalid input (password must be at least 8 characters)'],
  ['নিজের role বা active অবস্থা বদলানো যাবে না', 'You cannot change your own role or active status'],
  ['নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে', 'New password must be at least 8 characters'],
  ['পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে', 'Password must be at least 8 characters'],
  ['নিজেকে মোছা যাবে না', 'You cannot delete yourself'],
  ['টাস্ক বা assignment থাকলে মোছা যায় না। বদলে নিষ্ক্রিয় (Deactivate) করুন।', 'A user with tasks or assignments cannot be deleted. Deactivate the user instead.'],
  ['সম্পন্ন বা বাতিল টাস্ক assign করা যায় না', 'Completed or cancelled tasks cannot be assigned'],
  ['একজন সক্রিয় Member লাগবে', 'An active Member is required'],
  ['শুধু PENDING টাস্ক auto-assign হয়', 'Only PENDING tasks can be auto-assigned'],
  ['টিমে কোনো যোগ্য member পাওয়া যায়নি', 'No eligible member found in your team'],
  ['কোনো যোগ্য member পাওয়া যায়নি', 'No eligible member found'],
  ['এই member আপনার টিমে নেই', 'This member is not on your team'],
  ['কোনো সক্রিয় assignment নেই', 'There is no active assignment'],
  ['এই টাস্ক এখন review-এর অবস্থায় নেই', 'This task is not waiting for review'],
  ['কোনো পেন্ডিং অনুরোধ নেই', 'There is no pending request'],
  ['নাম কমপক্ষে ২ অক্ষরের হতে হবে', 'Name must be at least 2 characters'],
  ['Skill সেভ করা যায়নি (skill বৈধ কি না দেখুন)', 'Could not save skills (check that every skill is valid)'],
  ['বর্তমান পাসওয়ার্ড ভুল', 'Current password is incorrect'],
  ['এই টাস্ক আপনার নামে সক্রিয় নেই', 'This task is not active under your name'],
  ['এই টাস্ক এখন Accept করা যায় না', 'This task cannot be accepted right now'],
  ['এই টাস্ক এখন শুরু করা যায় না', 'This task cannot be started right now'],
  ['Progress ০ থেকে ১০০-এর মধ্যে হতে হবে', 'Progress must be between 0 and 100'],
  ['টাস্ক চলমান অবস্থায় নেই', 'The task is not in progress'],
  ['আগে টাস্ক শুরু করতে হবে', 'Start the task first'],
  ['কারণ লিখুন (কমপক্ষে ৩ অক্ষর)', 'Please give a reason (at least 3 characters)'],
  ['এই অবস্থায় reassign চাওয়া যায় না', 'Reassignment cannot be requested at this stage'],
  ['আপনার অনুরোধ আগেই পাঠানো হয়েছে', 'Your request has already been sent'],
];

// যেখানে context লাগে (বাটনের ভেতরের ছোট লেখা)
const REGEX_PAIRS = [
  [/(>\s*)যোগ(\s*<)/g, '$1Add$2'],
  [/(>\s*)সেট(\s*<)/g, '$1Set$2'],
  [/(>\s*)নাম(?=\s*<)/g, '$1Name'],
];

const ROOTS = ["frontend/src", "backend/src"];
const BENGALI = /[\u0980-\u09FF]/;
const sorted = [...PAIRS].sort((a, b) => b[0].length - a[0].length);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "generated" || name === "dist") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

let changedFiles = 0;
const leftovers = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    let text = fs.readFileSync(file, "utf8");
    if (!BENGALI.test(text)) continue;
    const before = text;
    for (const [bn, en] of sorted) text = text.split(bn).join(en);
    for (const [re, rep] of REGEX_PAIRS) text = text.replace(re, rep);
    if (text !== before) {
      fs.writeFileSync(file, text, "utf8");
      changedFiles++;
      console.log("updated:", file);
    }
    text.split("\n").forEach((line, i) => {
      const t = line.trim();
      if (!BENGALI.test(line)) return;
      if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return; // comments
      const code = line.replace(/(^|\s)\/\/.*$/, ""); // trailing comment ignored
      if (!BENGALI.test(code)) return;
      leftovers.push(`${file}:${i + 1}: ${t}`);
    });
  }
}
console.log(`\n${changedFiles} file(s) updated.`);
if (leftovers.length === 0) console.log("No Bangla text left in code (comments ignored). ✅");
else {
  console.log(`\nStill contains Bangla (${leftovers.length} lines), send these to me:\n`);
  leftovers.forEach((l) => console.log(l));
}