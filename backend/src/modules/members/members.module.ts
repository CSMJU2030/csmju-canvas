import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [AssetsModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
