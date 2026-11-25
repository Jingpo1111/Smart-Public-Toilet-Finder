import { ApiProperty } from '@nestjs/swagger';
import { AccessType, ToiletStatus } from '../../generated/prisma/client';

export class ImageAccessResponse {
  id: string;
  /** Short-lived signed URL. Do not store it; refetch the resource after `expiresAt`. */
  url: string;
  expiresAt: string;
  mimeType?: string;
  width?: number | null;
  height?: number | null;
}

/** `null` means unknown (not the same as false). */
export class FacilitiesResponse {
  hasWater: boolean | null;
  hasSoap: boolean | null;
  wheelchairAccessible: boolean | null;
  babyChanging: boolean | null;
  hasToiletPaper: boolean | null;
  hasHandDryer: boolean | null;
  isGenderNeutral: boolean | null;
}

export class OpeningHourResponse {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  /** HH:mm, Asia/Phnom_Penh */
  opensAt: string;
  /** HH:mm (24:00 = midnight end of day) */
  closesAt: string;
  /** true when the interval ends on the following day */
  closesNextDay: boolean;
  is24Hours: boolean;
}

export class DistanceResponse {
  meters: number;
  @ApiProperty({ enum: ['STRAIGHT_LINE_APPROXIMATE'] })
  type: 'STRAIGHT_LINE_APPROXIMATE';
  note: string;
}

export class ToiletSummaryResponse {
  id: string;
  name: string;
  nameKm: string | null;
  address: string;
  province: string;
  district: string | null;
  sangkat: string | null;
  latitude: number;
  longitude: number;
  @ApiProperty({ enum: AccessType })
  accessType: AccessType;
  /** KHR integer; null = unknown */
  priceKhr: number | null;
  @ApiProperty({ enum: ToiletStatus })
  status: ToiletStatus;
  facilities: FacilitiesResponse;
  averageRating: number | null;
  cleanlinessRating: number | null;
  reviewCount: number;
  isVerified: boolean;
  lastVerifiedAt: Date | null;
  /** null when opening hours are unknown */
  openNow: boolean | null;
  openingHoursKnown: boolean;
  coverImage: ImageAccessResponse | null;
  /** Present only when lat/lng were supplied */
  distance?: DistanceResponse;
  /** true for fictional development seed data — must be labelled in the UI */
  isSampleData: boolean;
}

export class ToiletDetailResponse extends ToiletSummaryResponse {
  description: string | null;
  descriptionKm: string | null;
  notes: string | null;
  openingHours: OpeningHourResponse[];
  @ApiProperty({ example: 'Asia/Phnom_Penh' })
  timezone: string;
  images: ImageAccessResponse[];
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Only when the request is authenticated */
  isFavorite?: boolean;
}

export class ToiletManagerRef {
  assignmentId: string;
  managerId: string;
  fullName: string;
  email: string;
}

export class AdminToiletResponse extends ToiletDetailResponse {
  archivedAt: Date | null;
  archiveReason: string | null;
  verifiedById: string | null;
  createdById: string | null;
  sourceSuggestionId: string | null;
  managers: ToiletManagerRef[];
  openReports: number;
}
