// Actual DB columns (from SHOW COLUMNS query)
const actualDbCols = [
  'id','userId','name','description','contactListId','audioFileId','messageText','voice',
  'callerIdNumber','callerIdName','status','maxConcurrentCalls','retryAttempts','retryDelay',
  'scheduledAt','timezone','timeWindowStart','timeWindowEnd','totalContacts','completedCalls',
  'answeredCalls','failedCalls','startedAt','completedAt','createdAt','updatedAt',
  'ivrEnabled','ivrOptions','abTestGroup','abTestVariant','targetStates','targetAreaCodes',
  'useGeoCallerIds','usePersonalizedTTS','ttsSpeed','useDidRotation','pacingMode',
  'pacingTargetDropRate','pacingMinConcurrent','pacingMaxConcurrent','scriptId','callbackNumber',
  'cpsLimit','useDidCallbackNumber','amdEnabled','voicemailAudioFileId','voicemailMessageText',
  'enforceContactTimezone','contactTzWindowStart','contactTzWindowEnd','ivrPaymentEnabled',
  'ivrPaymentAmountField','ivrPaymentDigit','predictiveAgentCount','predictiveTargetWaitTime',
  'predictiveMaxAbandonRate',
  // These are EXTRA columns in the actual DB that are NOT in the Drizzle schema:
  'voicemailDrop','voicemailAudioId','voicemailAudioUrl',
  'timezoneEnforcement','tzCallWindowStart','tzCallWindowEnd','ivrPaymentAmount',
  'routingMode','powerDialRatio','wrapUpTimeSecs','recordingEnabled','recordingRetentionDays',
  'voiceAiPromptId','didLabel','dayPartScripts','didPoolStrategy','didRotationMode','didManualIds'
];

// Drizzle schema columns (from schema.ts)
const drizzleCols = [
  'id','userId','name','description','contactListId','audioFileId','messageText','voice',
  'callerIdNumber','callerIdName','routingMode','voiceAiPromptId','powerDialRatio','wrapUpTimeSecs',
  'ivrEnabled','ivrOptions','amdEnabled','voicemailAudioFileId','voicemailMessageText',
  'enforceContactTimezone','contactTzWindowStart','contactTzWindowEnd','ivrPaymentEnabled',
  'ivrPaymentAmountField','ivrPaymentDigit','abTestGroup','abTestVariant','targetStates',
  'targetAreaCodes','useGeoCallerIds','usePersonalizedTTS','ttsSpeed','useDidRotation',
  'didLabel','didPoolStrategy','didRotationMode','didManualIds','scriptId','callbackNumber',
  'useDidCallbackNumber','dayPartScripts','predictiveAgentCount','predictiveTargetWaitTime',
  'predictiveMaxAbandonRate','recordingEnabled','recordingRetentionDays','pacingMode',
  'pacingTargetDropRate','pacingMinConcurrent','pacingMaxConcurrent','status','maxConcurrentCalls',
  'cpsLimit','retryAttempts','retryDelay','scheduledAt','timezone','timeWindowStart','timeWindowEnd',
  'totalContacts','completedCalls','answeredCalls','failedCalls','startedAt','completedAt',
  'createdAt','updatedAt'
];

console.log('=== Actual DB has ' + actualDbCols.length + ' columns ===');
console.log('=== Drizzle schema has ' + drizzleCols.length + ' columns ===');
console.log('');

const inDbNotDrizzle = actualDbCols.filter(c => !drizzleCols.includes(c));
const inDrizzleNotDb = drizzleCols.filter(c => !actualDbCols.includes(c));

console.log('In ACTUAL DB but NOT in Drizzle schema (old/duplicate columns):');
console.log(inDbNotDrizzle);
console.log('');
console.log('In Drizzle schema but NOT in actual DB (need migration):');
console.log(inDrizzleNotDb);
