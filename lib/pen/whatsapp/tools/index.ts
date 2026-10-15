// Every tool module, in the order their tools are shown to the model. One line per module.

import type { ToolModule } from './types'
import { confirmModule } from '../confirm'
import { timezoneModule } from './timezone'
import { calendarModule } from './calendar'

export const MODULES: ToolModule[] = [confirmModule, timezoneModule, calendarModule]
