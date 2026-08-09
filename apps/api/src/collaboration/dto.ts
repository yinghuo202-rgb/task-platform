import { IsString, MaxLength, MinLength } from "class-validator";

export class ApplicationDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  message!: string;
}

export class SubmissionDto {
  @IsString() @MinLength(1) @MaxLength(50_000)
  content!: string;
}

export class RevisionDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  message!: string;
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(5000)
  content!: string;
}
