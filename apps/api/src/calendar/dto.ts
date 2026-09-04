import { IsBoolean, IsDateString, IsHexColor, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CalendarRangeDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class CreateCalendarEventDto {
  @IsString() @MinLength(1) @MaxLength(120)
  title!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional() @IsBoolean()
  allDay?: boolean;

  @IsOptional() @IsHexColor()
  color?: string;
}

export class UpdateCalendarEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  title?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsDateString()
  startsAt?: string;

  @IsOptional() @IsDateString()
  endsAt?: string;

  @IsOptional() @IsBoolean()
  allDay?: boolean;

  @IsOptional() @IsHexColor()
  color?: string;
}

export class CreateCalendarTodoDto {
  @IsString() @MinLength(1) @MaxLength(160)
  title!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @IsOptional() @IsDateString()
  dueAt?: string | null;

  @IsOptional() @IsBoolean()
  allDay?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  position?: number;
}

export class UpdateCalendarTodoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160)
  title?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @IsOptional() @IsDateString()
  dueAt?: string | null;

  @IsOptional() @IsBoolean()
  allDay?: boolean;

  @IsOptional() @IsBoolean()
  completed?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  position?: number;
}

export class RespondCalendarSubscriptionDto {
  @IsIn(["APPROVE", "REJECT"])
  action!: "APPROVE" | "REJECT";
}
