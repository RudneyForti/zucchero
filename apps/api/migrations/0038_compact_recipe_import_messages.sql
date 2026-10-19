update recipe_moments
set description = null
where description like 'Etapas reconhecidas automaticamente na fonte %'
   or description like 'Subpreparação preservada da divisão original de %';
