import { IsBoolean, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSharedWishDto {
  @IsString() @MinLength(1) @MaxLength(500)
  title!: string;
}

export class CompleteSharedWishDto {
  @IsBoolean()
  completed!: boolean;
}
