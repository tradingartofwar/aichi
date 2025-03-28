async function testSchedule() {
  const startTime = new Date();
  startTime.setHours(startTime.getHours() + 1); // 1 hour from now
  const endTime = new Date(startTime.getTime() + 30 * 60000); // 30 minutes later

  const eventDetails = {
    staff: 'Bell', // Test with 'Angie' first; change to 'Bell' to test Bell’s calendar
    summary: 'Test Massage Appointment - March 25th',
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() }
  };

  try {
    // Corrected import path assuming nodes/ is a subdirectory of backend/
    console.log('Event details being sent:', eventDetails);
    const { scheduleAppointment } = await import('./nodes/schedule.node.js');
    const result = await scheduleAppointment(eventDetails);
    console.log('Scheduling result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testSchedule();
