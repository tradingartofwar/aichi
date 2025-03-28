// nodes/schedule.node.js

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

// Staff calendar IDs (updated with actual IDs)
const STAFF_CALENDARS = {
  Angie: 'd96e21c6ba72575ccf3b397f67ee90d075b1c517dfc86c7394f763eafa034661@group.calendar.google.com',
  Bell: '0ef80663e869c67108336d68bc96dbb22eba4711dc1d12fe5de1856b33ab6036@group.calendar.google.com'
};

// Generate Google OAuth URL for authentication
export function getAuthUrl() {
  const { client_id, client_secret, redirect_uris } = loadClientCredentials();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
}

export async function handleOAuth2Callback(code) {
  const { client_id, client_secret, redirect_uris } = loadClientCredentials();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), 'utf8');
  console.log('Tokens stored to', TOKEN_PATH);
}

// Check availability for a staff member
export async function checkAvailability(staff, startTime, endTime) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarId = STAFF_CALENDARS[staff];

  if (!calendarId) {
    throw new Error(`Staff member '${staff}' not found in STAFF_CALENDARS.`);
  }

  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];
    // Check for any overlap: if an event starts before the requested end time and ends after the requested start time
    const isOverlapping = events.some(event => {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      return eventStart < endTime && eventEnd > startTime;
    });

    return !isOverlapping; // True if no overlapping events
  } catch (error) {
    console.error(`Error checking availability for ${staff}:`, error);
    throw error;
  }
}

// Find next available slot for a staff member within business hours (10 AM - 10 PM)
export async function findNextAvailable(staff, durationMinutes, startFrom = new Date()) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarId = STAFF_CALENDARS[staff];

  const businessStartHour = 10; // 10 AM
  const businessEndHour = 22; // 10 PM

  let checkTime = new Date(startFrom);
  checkTime.setHours(businessStartHour, 0, 0, 0); // Start at 10 AM today
  if (checkTime < startFrom) checkTime.setDate(checkTime.getDate() + 1); // Move to next day if past 10 AM

  const maxDaysAhead = 7; // Look up to a week ahead
  for (let day = 0; day < maxDaysAhead; day++) {
    let currentTime = new Date(checkTime);
    while (currentTime.getHours() < businessEndHour) {
      const endTime = new Date(currentTime.getTime() + durationMinutes * 60000);
      if (endTime.getHours() > businessEndHour || (endTime.getHours() === businessEndHour && endTime.getMinutes() > 0)) break;

      const isAvailable = await checkAvailability(staff, currentTime, endTime);
      if (isAvailable) {
        return { startTime: currentTime, endTime };
      }
      currentTime.setMinutes(currentTime.getMinutes() + 30); // Check every 30 minutes
    }
    checkTime.setDate(checkTime.getDate() + 1); // Next day
  }
  return null; // No availability found
}

export async function scheduleAppointment(eventDetails) {
  console.log('Scheduling for staff:', eventDetails.staff);
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarId = STAFF_CALENDARS[eventDetails.staff];

  if (!calendarId) {
    throw new Error(`Staff member '${eventDetails.staff}' not found in STAFF_CALENDARS.`);
  }
  console.log('Using calendarId:', calendarId);

  const startTime = new Date(eventDetails.start.dateTime);
  const endTime = new Date(eventDetails.end.dateTime);

  // Check for duplicate events
  const startMin = new Date(startTime.getTime() - 60000); // 1 minute before
  const startMax = new Date(startTime.getTime() + 60000); // 1 minute after

  const response = await calendar.events.list({
    calendarId,
    timeMin: startMin.toISOString(),
    timeMax: startMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const duplicateEvent = response.data.items.find(event => 
    event.start.dateTime === eventDetails.start.dateTime &&
    event.end.dateTime === eventDetails.end.dateTime
  );

  if (duplicateEvent) {
    console.log("[Scheduling] Duplicate appointment found:", duplicateEvent.id);
    return { success: false, message: "Appointment already exists" };
  }

  // Create the event
  const event = {
    summary: eventDetails.summary || 'Massage Appointment',
    location: '123 Massage St, City',
    description: `Scheduled by Aichi for ${eventDetails.staff}`,
    start: { dateTime: eventDetails.start.dateTime, timeZone: 'America/Los_Angeles' },
    end: { dateTime: eventDetails.end.dateTime, timeZone: 'America/Los_Angeles' }
  };

  try {
    const createResponse = await calendar.events.insert({
      calendarId,
      resource: event
    });
    console.log('Event created:', createResponse.data.htmlLink);
    return { success: true, link: createResponse.data.htmlLink };
  } catch (error) {
    console.error('Error scheduling:', error);
    return { success: false, error: error.message };
  }
}

export async function handleScheduling(message) {
  // Legacy function remains unchanged
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  const eventStartTime = new Date();
  eventStartTime.setDate(eventStartTime.getDate() + 1);
  const eventEndTime = new Date(eventStartTime);
  eventEndTime.setHours(eventEndTime.getHours() + 1);

  const event = {
    summary: 'Test Aichi Appointment',
    location: '123 Massage St, City',
    description: 'Automated scheduling event from Aichi',
    start: { dateTime: eventStartTime.toISOString(), timeZone: 'America/Los_Angeles' },
    end: { dateTime: eventEndTime.toISOString(), timeZone: 'America/Los_Angeles' }
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });
    console.log('Event created:', response.data.htmlLink);
    return { response: `Scheduled event: ${response.data.htmlLink}` };
  } catch (error) {
    console.error('Error scheduling:', error);
    return { response: 'Failed to schedule event.' };
  }
}

function loadClientCredentials() {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  return JSON.parse(content).web;
}

async function authorize() {
  const { client_id, client_secret, redirect_uris } = loadClientCredentials();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  let tokens;
  try {
    const tokenStr = fs.readFileSync(TOKEN_PATH, 'utf8');
    tokens = JSON.parse(tokenStr);
  } catch (err) {
    throw new Error('No token found. Please authorize first by visiting /api/schedule/auth');
  }
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
}