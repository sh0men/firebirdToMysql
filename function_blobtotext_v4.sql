SET TERM ^;
recreate function blobtotext (str blob character set octets) 
returns varchar(32764)
as
declare a varchar(32764);
declare b varchar(8191);
begin
--a = SUBSTRING(str FROM 1 FOR 8191) ;
--a = cast(a as varchar(32764) character set ISO8859_2);
a = str;
a = replace(a, '„', '"');
a = replace(a, '”', '"');
a = replace(a, '…', '.');
a = replace(a, '–', '-');
a = replace(a, '¬', '-');
a = replace(a, '—', '-');
a = replace(a, '“', '"');
a = replace(a, '¶', '');
a = replace(a, '©', '');
a = replace(a, '‰', '%o');
a = replace(a, '‘', '''');
a = replace(a, '±', '+/-');
a = cast(a as varchar(32764) character set octets);
b = substring ( a from 1 for 8191);
return b;
end;
^
SET TERM ;^
