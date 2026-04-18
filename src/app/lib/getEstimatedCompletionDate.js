// Utility function to calculate estimated completion date, skipping weekends
export function getEstimatedCompletionDate(hoursRemaining, avgDailyHours) {
  const workingDaysNeeded = Math.ceil(hoursRemaining / avgDailyHours);
  let daysAdded = 0;
  let date = new Date();

  while (daysAdded < workingDaysNeeded) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
      daysAdded++;
    }
  }

  // Format date as 'MMM DD, YYYY'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
}
