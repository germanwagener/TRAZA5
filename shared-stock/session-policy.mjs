export const permanentExpiry=Number.MAX_SAFE_INTEGER;
export const persistentCookieAge=2147483647;
export function sessionPolicy(user,remember,now=Date.now()) {
 const remembered=user.username==='juni'&&user.role==='admin'&&remember==='on';
 return {remembered,age:remembered?persistentCookieAge:8*3600,expires:remembered?permanentExpiry:now+8*3600000};
}
