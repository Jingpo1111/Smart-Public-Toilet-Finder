import { NotificationType } from '../generated/prisma/client';

export interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
  titleKm: string;
  messageKm: string;
  data?: Record<string, unknown>;
}

/**
 * Bilingual (English / Khmer) notification texts. The frontend can also localise from `type` + `data`.
 */
export const NotificationTemplates = {
  suggestionSubmitted: (suggestionId: string, name: string): NotificationContent => ({
    type: NotificationType.SUGGESTION_SUBMITTED,
    title: 'New WC location submitted',
    message: `A new WC location "${name}" is waiting for review.`,
    titleKm: 'មានការស្នើទីតាំងបង្គន់ថ្មី',
    messageKm: `ទីតាំងបង្គន់ថ្មី "${name}" កំពុងរង់ចាំការពិនិត្យ។`,
    data: { suggestionId },
  }),
  suggestionApproved: (suggestionId: string, toiletId: string, name: string): NotificationContent => ({
    type: NotificationType.SUGGESTION_APPROVED,
    title: 'Your WC location was approved',
    message: `Thank you! "${name}" has been verified and is now visible on the public map.`,
    titleKm: 'ទីតាំងបង្គន់របស់អ្នកត្រូវបានអនុម័ត',
    messageKm: `សូមអរគុណ! "${name}" ត្រូវបានផ្ទៀងផ្ទាត់ ហើយឥឡូវនេះបង្ហាញនៅលើផែនទីសាធារណៈ។`,
    data: { suggestionId, toiletId },
  }),
  suggestionRejected: (suggestionId: string, name: string, reason: string): NotificationContent => ({
    type: NotificationType.SUGGESTION_REJECTED,
    title: 'Your WC location was not approved',
    message: `"${name}" was not approved. Reason: ${reason}. You can correct it and submit again.`,
    titleKm: 'ទីតាំងបង្គន់របស់អ្នកមិនត្រូវបានអនុម័ត',
    messageKm: `"${name}" មិនត្រូវបានអនុម័តទេ។ មូលហេតុ៖ ${reason}។ អ្នកអាចកែតម្រូវ ហើយដាក់ស្នើម្តងទៀត។`,
    data: { suggestionId, reason },
  }),
  reportCreated: (reportId: string, toiletId: string, toiletName: string): NotificationContent => ({
    type: NotificationType.REPORT_CREATED,
    title: 'New maintenance report',
    message: `A new problem was reported at "${toiletName}".`,
    titleKm: 'មានរបាយការណ៍បញ្ហាថ្មី',
    messageKm: `មានបញ្ហាថ្មីត្រូវបានរាយការណ៍នៅ "${toiletName}"។`,
    data: { reportId, toiletId },
  }),
  reportStatusChanged: (reportId: string, toiletName: string, status: string): NotificationContent => ({
    type: NotificationType.REPORT_STATUS_CHANGED,
    title: 'Your report was updated',
    message: `Your report about "${toiletName}" is now ${status.replace('_', ' ').toLowerCase()}.`,
    titleKm: 'របាយការណ៍របស់អ្នកត្រូវបានធ្វើបច្ចុប្បន្នភាព',
    messageKm: `ស្ថានភាពរបាយការណ៍របស់អ្នកអំពី "${toiletName}" ត្រូវបានផ្លាស់ប្តូរ។`,
    data: { reportId, status },
  }),
  reviewModerated: (reviewId: string, toiletName: string, hidden: boolean): NotificationContent => ({
    type: NotificationType.REVIEW_MODERATED,
    title: hidden ? 'Your review was hidden' : 'Your review is visible again',
    message: hidden
      ? `Your review of "${toiletName}" was hidden by a moderator.`
      : `Your review of "${toiletName}" is visible again.`,
    titleKm: hidden ? 'ការវាយតម្លៃរបស់អ្នកត្រូវបានលាក់' : 'ការវាយតម្លៃរបស់អ្នកត្រូវបានបង្ហាញឡើងវិញ',
    messageKm: hidden
      ? `ការវាយតម្លៃរបស់អ្នកលើ "${toiletName}" ត្រូវបានលាក់ដោយអ្នកសម្របសម្រួល។`
      : `ការវាយតម្លៃរបស់អ្នកលើ "${toiletName}" ត្រូវបានបង្ហាញឡើងវិញ។`,
    data: { reviewId, hidden },
  }),
  roleChanged: (role: string): NotificationContent => ({
    type: NotificationType.ROLE_CHANGED,
    title: 'Your account role changed',
    message: `Your account role is now ${role}.`,
    titleKm: 'តួនាទីគណនីរបស់អ្នកត្រូវបានផ្លាស់ប្តូរ',
    messageKm: `តួនាទីគណនីរបស់អ្នកឥឡូវនេះគឺ ${role}។`,
    data: { role },
  }),
  managerAssigned: (toiletId: string, toiletName: string): NotificationContent => ({
    type: NotificationType.MANAGER_ASSIGNED,
    title: 'New facility assigned',
    message: `You are now a manager of "${toiletName}".`,
    titleKm: 'អ្នកត្រូវបានចាត់តាំងឱ្យគ្រប់គ្រងបង្គន់',
    messageKm: `ឥឡូវនេះអ្នកជាអ្នកគ្រប់គ្រង "${toiletName}"។`,
    data: { toiletId },
  }),
};
