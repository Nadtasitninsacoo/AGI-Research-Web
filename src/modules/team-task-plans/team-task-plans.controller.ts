
import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiTokenGuard } from '../../common/auth/api-token.guard.js';
import { CreateTeamTaskPlanDto } from './dto/create-team-task-plan.dto.js';
import { TeamTaskPlansService } from './team-task-plans.service.js';

@Controller('api/team-task-plans')
@UseGuards(ApiTokenGuard)
export class TeamTaskPlansController {
  constructor(
    private readonly teamTaskPlansService: TeamTaskPlansService,
  ) {}

  @Post()
  async create(@Body() dto: CreateTeamTaskPlanDto) {
    const plan = await this.teamTaskPlansService.create(dto);

    return {
      success: true,
      message: 'Team task plan saved successfully.',
      data: plan,
    };
  }
}
