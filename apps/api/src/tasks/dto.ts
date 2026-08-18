import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  ClaimMode,
  LocationType,
  RewardType,
  TaskStatus,
  TaskTimeMode,
  TaskTimeUnit,
  Visibility,
} from "../generated/prisma/enums";

export class RequirementDto {
  @IsString() @MinLength(1) @MaxLength(100)
  title!: string;

  @IsString() @MinLength(1) @MaxLength(2000)
  description!: string;

  @IsBoolean()
  required!: boolean;

  @IsInt() @Min(0)
  sortOrder!: number;
}

export class CreateTaskDto {
  @IsUUID()
  projectId!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  title!: string;

  @IsString() @MinLength(1) @MaxLength(300)
  summary!: string;

  @IsString() @MinLength(1) @MaxLength(20_000)
  description!: string;

  @IsOptional() @IsString() @MaxLength(50)
  category?: string;

  @IsEnum(Visibility)
  visibility!: Visibility;

  @IsEnum(ClaimMode)
  claimMode!: ClaimMode;

  @IsInt() @Min(1) @Max(20)
  maxAssignees!: number;

  @IsEnum(RewardType)
  rewardType!: RewardType;

  @IsOptional() @IsNumberString()
  rewardAmount?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  rewardDescription?: string | null;

  @IsEnum(LocationType)
  locationType!: LocationType;

  @IsOptional() @IsString() @MaxLength(500)
  locationDescription?: string | null;

  @IsEnum(TaskTimeMode)
  timeMode!: TaskTimeMode;

  @ValidateIf((input: CreateTaskDto) => input.timeMode === TaskTimeMode.WITHIN)
  @Type(() => Number) @IsInt() @Min(1) @Max(525_600)
  durationValue?: number | null;

  @ValidateIf((input: CreateTaskDto) => input.timeMode === TaskTimeMode.WITHIN)
  @IsEnum(TaskTimeUnit)
  durationUnit?: TaskTimeUnit | null;

  @ValidateIf((input: CreateTaskDto) => input.timeMode !== TaskTimeMode.WITHIN)
  @IsDateString()
  deadline?: string | null;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => RequirementDto)
  requirements!: RequirementDto[];
}

export class UpdateTaskDto extends CreateTaskDto {
  @IsInt() @Min(1)
  version!: number;
}

export class ListTasksDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 12;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsUUID()
  projectId?: string;

  @IsOptional() @IsString() @MaxLength(50)
  category?: string;

  @IsOptional() @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional() @IsEnum(RewardType)
  rewardType?: RewardType;

  @IsOptional() @IsEnum(LocationType)
  locationType?: LocationType;

  @IsOptional() @IsEnum(["createdAt", "deadline", "rewardAmount"])
  sort: "createdAt" | "deadline" | "rewardAmount" = "createdAt";

  @IsOptional() @IsEnum(["asc", "desc"])
  order: "asc" | "desc" = "desc";

  @IsOptional() @IsString()
  scope?: "published" | "assigned" | "completed" | "applications" | "available";
}
