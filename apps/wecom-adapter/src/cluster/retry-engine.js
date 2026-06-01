function retry(task,max){max=max||3;return{taskId:task.id||'unknown',attempts:1,maxRetries:max,status:'retrying',nextRetry:Date.now()+5000}}
module.exports={retry:retry};
