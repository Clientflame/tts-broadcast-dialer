const inputFields = [
  'name', 'description', 'contactListId', 'audioFileId', 'messageText', 'voice',
  'ttsProvider', 'callerIdNumber', 'callerIdName', 'ivrEnabled', 'ivrOptions',
  'abTestGroup', 'abTestVariant', 'targetStates', 'targetAreaCodes', 'useGeoCallerIds',
  'maxConcurrentCalls', 'cpsLimit', 'retryAttempts', 'retryDelay', 'scheduledAt',
  'timezone', 'timeWindowStart', 'timeWindowEnd', 'usePersonalizedTTS', 'ttsSpeed',
  'useDidRotation', 'didLabel', 'didPoolStrategy', 'didRotationMode',
  'didManualIds', 'pacingMode', 'pacingTargetDropRate', 'pacingMinConcurrent', 'pacingMaxConcurrent',
  'scriptId', 'callbackNumber', 'useDidCallbackNumber',
  'predictiveAgentCount', 'predictiveMaxAbandonRate',
  'amdEnabled', 'voicemailAudioId', 'voicemailMessage',
  'ivrPaymentEnabled', 'ivrPaymentDigit', 'ivrPaymentAmount',
  'tzEnforcementEnabled', 'tcpaStartHour', 'tcpaEndHour',
  'routingMode', 'voiceAiPromptId', 'dayPartScripts'
];

const dbCols = [
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

// These are destructured out of 'rest' in the current code
const destructured = ['ttsProvider', 'voicemailAudioId', 'voicemailMessage', 'ivrPaymentAmount', 'tzEnforcementEnabled', 'tcpaStartHour', 'tcpaEndHour'];
// didManualIds is also destructured but then re-added as parsed JSON

const restFields = inputFields.filter(f => !destructured.includes(f));
const mismatched = restFields.filter(f => !dbCols.includes(f));
console.log('Fields in rest that are NOT DB columns:', mismatched);

// These would cause the SQL error - they get passed to db.insert() but don't exist as columns
