/**
 * Safe date formatting utility
 * Prevents "Invalid Date" errors and provides user-friendly date strings
 */

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'No date';
  
  try {
    const date = new Date(dateString);
    
    // Check if valid
    if (isNaN(date.getTime())) {
      return 'No date';
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      // Today - include time
      return `Today • ${date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  } catch {
    return 'No date';
  }
}

/**
 * Format date for display in recent logs (simpler format)
 */
export function formatDateSimple(dateString: string | null | undefined): {
  dateStr: string;
  timeStr: string;
} {
  if (!dateString) {
    return { dateStr: 'No date', timeStr: '' };
  }
  
  try {
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
      return { dateStr: 'No date', timeStr: '' };
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const isToday = logDate.getTime() === today.getTime();
    const isYesterday = logDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000;
    
    let dateStr: string;
    if (isToday) {
      dateStr = 'Today';
    } else if (isYesterday) {
      dateStr = 'Yesterday';
    } else {
      dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
    
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    
    return { dateStr, timeStr };
  } catch {
    return { dateStr: 'No date', timeStr: '' };
  }
}

