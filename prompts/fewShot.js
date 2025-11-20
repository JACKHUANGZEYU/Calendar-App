// prompts/fewShot.js
export const FEW_SHOT_EXAMPLES = `
### EXAMPLES (Mirror this structure exactly)
- Always copy the real "date" and "title" from Existing Tasks; never use placeholders.
- Multiple user requests = multiple actions, in the given order.

USER: "Split the Gym task at 2pm"
EXISTING TASK: { "title": "Gym", "date": "2024-11-10", "start": "13:00", "end": "15:00" }
OUTPUT: { "actions": [{ "type": "split", "date": "2024-11-10", "title": "Gym", "atTime": "14:00" }] }

USER: "Delay lunch by 45 minutes"
EXISTING TASK: { "title": "Lunch", "date": "2024-11-10", "start": "12:00", "end": "13:00" }
OUTPUT: { "actions": [{ "type": "shift", "date": "2024-11-10", "title": "Lunch", "deltaMinutes": 45 }] }

USER: "Push the meeting back by an hour"
EXISTING TASK: { "title": "Meeting", "date": "2024-11-10", "start": "09:00", "end": "10:00" }
OUTPUT: { "actions": [{ "type": "shift", "date": "2024-11-10", "title": "Meeting", "deltaMinutes": 60 }] }

USER: "Start basketball an hour earlier"
EXISTING TASK: { "title": "Basketball", "date": "2024-11-10", "start": "08:00", "end": "09:30" }
OUTPUT: { "actions": [{ "type": "shift", "date": "2024-11-10", "title": "Basketball", "deltaMinutes": -60 }] }

USER: "Start lunch 30 mins earlier"
EXISTING TASK: { "title": "Lunch", "date": "2024-11-10", "start": "12:00", "end": "13:00" }
OUTPUT: { "actions": [{ "type": "resize", "date": "2024-11-10", "title": "Lunch", "newStart": "11:30" }] }

USER: "Extend the lunch time by 1 hour"
EXISTING TASK: { "title": "Lunch", "date": "2024-11-10", "start": "12:00", "end": "13:00" }
OUTPUT: { "actions": [{ "type": "resize", "date": "2024-11-10", "title": "Lunch", "newEnd": "14:00" }] }

USER: "Extend the coding block to end at 18:30"
EXISTING TASK: { "title": "Coding", "date": "2024-11-10", "start": "16:30", "end": "18:00" }
OUTPUT: { "actions": [{ "type": "resize", "date": "2024-11-10", "title": "Coding", "newEnd": "18:30" }] }

USER: "Push the gym session back by an hour, and split the coding block at 3pm."
EXISTING TASKS:
- { "title": "Gym", "date": "2024-11-10", "start": "07:00", "end": "08:00" }
- { "title": "Coding", "date": "2024-11-10", "start": "13:00", "end": "16:00" }
OUTPUT: { "actions": [
  { "type": "shift", "date": "2024-11-10", "title": "Gym", "deltaMinutes": 60 },
  { "type": "split", "date": "2024-11-10", "title": "Coding", "atTime": "15:00" }
] }

USER: "Take a 30-minute break at 11 during study"
EXISTING TASK: { "title": "Study", "date": "2024-11-10", "start": "08:00", "end": "12:00" }
LOGIC: Default break = 30m. First part: 08:00–11:00. Break: 11:00–11:30. Remainder: 1h (total 4h - 3h) placed after break: 11:30–12:30.
OUTPUT: { "actions": [
  { "type": "resize", "date": "2024-11-10", "title": "Study", "newEnd": "11:00" },
  { "type": "add", "title": "Break", "date": "2024-11-10", "start": "11:00", "end": "11:30" },
  { "type": "add", "title": "Study", "date": "2024-11-10", "start": "11:30", "end": "12:30" }
] }

USER: "Add a 1 hour break at 11 and start studying 30 minutes earlier"
EXISTING TASK: { "title": "Study", "date": "2024-11-10", "start": "08:00", "end": "12:00" }
LOGIC: Total study time stays 4h. New start 07:30. First part length up to 11:00 is 3.5h. Remaining 0.5h goes after the 1h break: 12:00–12:30.
OUTPUT: { "actions": [
  { "type": "resize", "date": "2024-11-10", "title": "Study", "newStart": "07:30", "newEnd": "11:00" },
  { "type": "add", "title": "Break", "date": "2024-11-10", "start": "11:00", "end": "12:00" },
  { "type": "add", "title": "Study", "date": "2024-11-10", "start": "12:00", "end": "12:30" }
] }

USER: "Watch a 30 minute movie at 11, not at the same time as study"
EXISTING TASK: { "title": "Study", "date": "2024-11-10", "start": "08:00", "end": "12:00" }
LOGIC: Exclusive insert. First part: 08:00–11:00. Movie: 11:00–11:30. Remaining study: 11:30–12:30 (keeps total 4h).
OUTPUT: { "actions": [
  { "type": "resize", "date": "2024-11-10", "title": "Study", "newEnd": "11:00" },
  { "type": "add", "title": "Movie", "date": "2024-11-10", "start": "11:00", "end": "11:30" },
  { "type": "add", "title": "Study", "date": "2024-11-10", "start": "11:30", "end": "12:30" }
] }

USER: "Have lunch at 11 while studying"
EXISTING TASK: { "title": "Study", "date": "2024-11-10", "start": "08:00", "end": "12:00" }
LOGIC: Explicitly concurrent; do not carve the study block.
OUTPUT: { "actions": [
  { "type": "add", "title": "Lunch", "date": "2024-11-10", "start": "11:00", "end": "11:30" }
] }

USER: "Color all study slices blue" (after splitting study)
EXISTING TASKS:
- { "title": "Study", "date": "2024-11-10", "start": "08:00", "end": "11:00" }
- { "title": "Study", "date": "2024-11-10", "start": "11:30", "end": "12:30" }
OUTPUT: { "actions": [
  { "type": "setColor", "date": "2024-11-10", "title": "Study", "color": "bg-blue-500" }
] }

USER: "Make basketball an hour longer and also start it 30 minutes earlier"
EXISTING TASK: { "title": "Basketball", "date": "2024-11-10", "start": "07:00", "end": "08:00" }
LOGIC: Total +60 minutes. Start earlier by 30 (newStart). Remaining +30 applied to the end (newEnd).
OUTPUT: { "actions": [{ "type": "resize", "date": "2024-11-10", "title": "Basketball", "newStart": "06:30", "newEnd": "08:30" }] }

USER: "Move the overnight deploy 90 minutes later"
EXISTING TASK: { "title": "Deploy", "date": "2024-11-10", "start": "23:00", "end": "25:00" }
OUTPUT: { "actions": [{ "type": "shift", "date": "2024-11-10", "title": "Deploy", "deltaMinutes": 90 }] }

USER: "Cut the maintenance window into two parts at midnight and color the rest red"
EXISTING TASK: { "title": "Maintenance", "date": "2024-11-10", "start": "21:30", "end": "25:30" }
OUTPUT: { "actions": [
  { "type": "split", "date": "2024-11-10", "title": "Maintenance", "atTime": "24:00" },
  { "type": "setColor", "date": "2024-11-10", "title": "Maintenance", "color": "bg-rose-400" }
] }
`;
