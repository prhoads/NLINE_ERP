CREATE FUNCTION dbo.tryton_json_get(@json NVARCHAR(MAX), @key NVARCHAR(4000))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    -- Return the JSON text of the value of the top-level key of a compact
    -- JSON object (as written by Tryton) or NULL if missing or null.
    -- @key is the JSON encoded key (with quotes).
    IF @json IS NULL OR @key IS NULL
        RETURN NULL;
    DECLARE @length INT = LEN(@json + N'.') - 1;
    DECLARE @token NVARCHAR(MAX) = @key + N':';
    DECLARE @token_length INT = LEN(@token + N'.') - 1;
    DECLARE @i INT = 1;
    DECLARE @depth INT = 0;
    DECLARE @in_string BIT = 0;
    DECLARE @escape BIT = 0;
    DECLARE @start INT = 0;
    DECLARE @previous NCHAR(1) = N'';
    DECLARE @char NCHAR(1);
    DECLARE @value NVARCHAR(MAX);
    WHILE @i <= @length
    BEGIN
        SET @char = SUBSTRING(@json, @i, 1);
        IF @in_string = 1
        BEGIN
            IF @escape = 1
                SET @escape = 0;
            ELSE IF @char = N'\'
                SET @escape = 1;
            ELSE IF @char = N'"'
            BEGIN
                SET @in_string = 0;
                SET @previous = @char;
            END
            SET @i = @i + 1;
            CONTINUE;
        END
        IF @char = N'"'
        BEGIN
            IF @depth = 1 AND @start = 0
                    AND (@previous = N'{' OR @previous = N',')
                    AND SUBSTRING(@json, @i, @token_length)
                        COLLATE Latin1_General_BIN2
                        = @token COLLATE Latin1_General_BIN2
            BEGIN
                SET @i = @i + @token_length;
                SET @start = @i;
                SET @previous = N':';
                CONTINUE;
            END
            SET @in_string = 1;
        END
        ELSE IF @char = N'{' OR @char = N'['
            SET @depth = @depth + 1;
        ELSE IF @char = N'}' OR @char = N']'
        BEGIN
            IF @depth = 1 AND @start > 0
                BREAK;
            SET @depth = @depth - 1;
        END
        ELSE IF @char = N',' AND @depth = 1 AND @start > 0
            BREAK;
        SET @previous = @char;
        SET @i = @i + 1;
    END
    IF @start = 0 OR @i > @length
        RETURN NULL;
    SET @value = SUBSTRING(@json, @start, @i - @start);
    IF @value = N'null'
        RETURN NULL;
    RETURN @value;
END
GO
CREATE FUNCTION dbo.tryton_trim(
    @string NVARCHAR(MAX), @characters NVARCHAR(4000), @position NVARCHAR(8))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    -- Remove the characters from the start and/or end of the string
    IF @string IS NULL OR @characters IS NULL
        RETURN @string;
    DECLARE @start INT = 1;
    DECLARE @end INT = LEN(@string + N'.') - 1;
    IF @position IN (N'BOTH', N'LEADING')
        WHILE @start <= @end
                AND CHARINDEX(SUBSTRING(@string, @start, 1)
                    COLLATE Latin1_General_BIN2,
                    @characters COLLATE Latin1_General_BIN2) > 0
            SET @start = @start + 1;
    IF @position IN (N'BOTH', N'TRAILING')
        WHILE @end >= @start
                AND CHARINDEX(SUBSTRING(@string, @end, 1)
                    COLLATE Latin1_General_BIN2,
                    @characters COLLATE Latin1_General_BIN2) > 0
            SET @end = @end - 1;
    RETURN SUBSTRING(@string, @start, @end - @start + 1);
END
