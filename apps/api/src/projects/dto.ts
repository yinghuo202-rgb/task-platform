import { IsEnum, IsHexColor, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { ProjectKind, ProjectRole } from "../generated/prisma/enums";

export class CreateProjectDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsHexColor()
  color?: string;

  @IsOptional() @IsEnum(ProjectKind)
  kind?: ProjectKind;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsHexColor()
  color?: string;

  @IsOptional() @IsEnum(ProjectKind)
  kind?: ProjectKind;
}

export class AddProjectMemberDto {
  @IsString() @MinLength(3) @MaxLength(254)
  identifier!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class UpdateProjectMemberDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class ProjectIdDto {
  @IsUUID()
  projectId!: string;
}
