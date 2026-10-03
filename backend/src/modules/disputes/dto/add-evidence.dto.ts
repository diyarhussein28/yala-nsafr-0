import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';

export class AddEvidenceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidenceUrls: string[];
}
