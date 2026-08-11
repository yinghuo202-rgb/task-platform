import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { EntryType, Visibility } from "../generated/prisma/enums";

export class ListEntriesDto {
  @IsOptional()
  @IsEnum(["index", "list"])
  view: "index" | "list" = "list";

  @IsOptional()
  @IsEnum(EntryType)
  type?: EntryType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit = 500;
}

export class BatchEntriesDto {
  @Transform(({ value }) => typeof value === "string" ? value.split(",").filter(Boolean) : value)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsUUID("4", { each: true })
  ids!: string[];
}

export class CreateEntryDto {
  @IsEnum(EntryType)
  type!: EntryType;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(100_000)
  contentMarkdown = "";

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  rating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string | null;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateEntryDto extends CreateEntryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateEntryCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1200)
  content!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  anchorBlock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  anchorQuote?: string;
}
