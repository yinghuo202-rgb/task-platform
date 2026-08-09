import { IsBoolean, IsDateString, IsHexColor, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

export class RespondCalendarSubscriptionDto {
  @IsIn(["APPROVE", "REJECT"])
  action!: "APPROVE" | "REJECT";
}
