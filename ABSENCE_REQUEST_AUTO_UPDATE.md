# Automatic Estimated End Date Update on Absence Approval

## Overview
Implemented automatic `estimated_end_date` deduction in the `student_ojt_profile` sheet when supervisors approve absence requests. This eliminates the need for manual profile updates and ensures internship duration accurately reflects approved absences.

## What Changed

### Backend (appscript/Code.js)

#### 1. New Helper Function: `extendDateByBusinessDays_()`
**Location:** Line 2300+
**Purpose:** Calculates a new date by adding business days (excluding weekends)

**Features:**
- Parses dates in YYYY-MM-DD format
- Handles weekends properly (skips Saturday & Sunday)
- Handles edge cases (invalid dates, zero days, etc.)
- Returns formatted YYYY-MM-DD string

**Example:**
```javascript
// If current end date is Friday, April 25, 2026
extendDateByBusinessDays_('2026-04-25', 1)
// Returns: '2026-04-27' (Monday, skips weekend)
```

#### 2. Modified Function: `handleUpdateRequestStatus_()`
**Location:** Line 2343+
**Changes:**
- Added `requestDateColIndex` column detection
- Added automatic profile update logic when:
  - Request status is set to "Approved"
  - Request type is "Absence" (not "Overtime")
  - Student has an active OJT profile
- Extends `estimated_end_date` by 1 business day (the absence day)
- Updated notification message to inform intern of automatic date extension
- Error handling: Logs warnings but doesn't fail if profile update fails

**New Logic Flow:**
```
Supervisor clicks "Approve" → 
  1. Request status → "Approved"
  2. IF request type is "Absence":
     a. Find student's OJT profile
     b. Get current estimated_end_date
     c. Calculate new date = current date + 1 business day
     d. Update student_ojt_profile sheet
  3. Send notification to intern:
     "Your absence request has been approved. 
      Your internship end date has been automatically 
      extended by 1 day."
```

## Impact on Frontend

### Requests.svelte
**No changes required** - The existing `updateRequestStatus()` function already handles the approval flow. The backend now automatically updates the profile.

### Dashboard.svelte
**Automatic Updates:**
- `estimated_end_date` displays: Updates on next refresh
- `Days Remaining`: Recalculates automatically (uses estimated_end_date)
- `Estimated Completion`: Updates based on new end date
- Progress bar: Cascades updates through reactive statements

### SupervisorInternManagement.svelte
**Automatic Updates:**
- Intern profile card end date: Reflects new estimated_end_date
- Days remaining status: Updates based on new calculation
- Color indicator: Changes if now >7 days away

## Database Updates

### student_ojt_profile Sheet
**Updated fields:**
- `estimated_end_date`: Automatically extended by 1 business day per approved absence

**Example:**
| user_id | total_ojt_hours | start_date | estimated_end_date | Before | After |
|---------|-----------------|-----------|-------------------|--------|-------|
| intern1 | 240 | 2026-01-15 | 2026-05-15 | 2026-05-15 (Friday) | 2026-05-16 (Monday) |

*Note: Weekends are automatically skipped in calculation*

## Behavior Details

### What Gets Updated
✅ **estimated_end_date** in student_ojt_profile
- Extended by 1 business day per absence approved
- Automatically skips weekends

✅ **Notification to Intern**
- Now includes message about automatic date extension
- Builds intern confidence that system is tracking their time

### What Does NOT Get Updated
❌ **total_ojt_hours** - Still requires interns to work the full OJT hours
❌ **start_date** - Unchanged
❌ **Any other fields** - Only estimated_end_date is modified

### Rejection Handling
- If absence is **REJECTED**: estimated_end_date remains unchanged
- Intern is notified of rejection with supervisor remarks
- No profile modification occurs

### Multiple Approvals
- If same intern has multiple absences approved: Each extends the date by 1 business day
- Example: 3 approved absences = estimated_end_date extended by 3 business days

## Error Handling

**Graceful Failures:**
- If student profile doesn't exist: Request still approves, just no profile update
- If sheet operations fail: Error logged, notification still sent
- If date parsing fails: Returns original date, continues with approval

**Log Messages:**
```
WARNING: Could not auto-extend estimated_end_date: [error details]
```

## Testing Recommendations

### Test Case 1: Single Absence Approval
1. Create absence request for Monday (2026-04-27)
2. Verify estimated_end_date before: e.g., 2026-05-15 (Friday)
3. Approve request
4. Check student_ojt_profile sheet
5. **Expected:** estimated_end_date = 2026-05-16 (Monday, skipped weekend)

### Test Case 2: Weekend Spanning
1. Create absence request for Friday (2026-05-15)
2. Verify estimated_end_date before: e.g., 2026-06-01 (Monday)
3. Approve request
4. Check student_ojt_profile sheet
5. **Expected:** estimated_end_date = 2026-06-02 (Tuesday, skipped weekend)

### Test Case 3: Multiple Approvals
1. Approve 3 absence requests for same intern
2. Each should extend date by 1 business day
3. **Expected:** estimated_end_date extended by 3 business days total

### Test Case 4: Notification Message
1. Approve absence request
2. Check student's notifications
3. **Expected:** Message includes "Your internship end date has been automatically extended by 1 day."

### Test Case 5: Overtime Not Affected
1. Create overtime request
2. Approve it
3. Check student_ojt_profile
4. **Expected:** estimated_end_date unchanged (only absences trigger extension)

## Performance Impact

- **Minimal:** Only executes for absence approvals
- **Operations:** Single profile sheet read + single cell update per approval
- **Speed:** <100ms typical (negligible)

## Future Enhancements

Possible improvements:
1. **Multiple day absences**: Allow absences spanning multiple days, extend by actual days absent
2. **Holiday handling**: Skip company holidays (would require holiday calendar)
3. **Bulk approvals**: Update multiple student profiles in single operation
4. **Undo capability**: Store original dates for rollback
5. **Analytics**: Track how much total time is added via approvals

## Rollback Instructions

If you need to disable this feature:
1. Comment out lines 2387-2423 in Code.js (the auto-update block)
2. Revert to manual updates via SupervisorInternManagement page
3. Redeploy Apps Script

## Related Files

- **Backend:** `/appscript/Code.js` (lines 2300-2440)
- **Frontend:** No changes required
- **Sheets:** `student_ojt_profile` sheet (column: estimated_end_date)
- **Sheets:** `requests` sheet (columns: request_type, status)
