// Every tool module, in the order their tools are shown to the model. One line per module.

import type { ToolModule } from './types'
import { confirmModule } from '../confirm'
import { offersModule } from './offers'
import { parityModule } from './parity'
import { timezoneModule } from './timezone'
import { calendarModule } from './calendar'
import { connectionsModule } from './connections'
import { googleModule } from './google'
import { granolaModule } from './granola'
import { audioModule } from './audio'
import { mailReadModule } from './mailread'

export const MODULES: ToolModule[] = [confirmModule, offersModule, parityModule, timezoneModule, calendarModule, connectionsModule, googleModule, granolaModule, audioModule, mailReadModule]
