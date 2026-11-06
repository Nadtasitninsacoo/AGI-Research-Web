// File: src/dark-agi/dark-agi.module.ts

import { Module } from "@nestjs/common";
import { MilitaryToolsService } from "./tools/military-tools.service";

@Module({
  providers: [MilitaryToolsService],
  exports: [MilitaryToolsService], // Export to make it available for other modules
})
export class DarkAgiModule {}
