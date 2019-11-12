// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export const enum KeywordKind {
    And = "and",
    As = "as",
    Each = "each",
    Else = "else",
    Error = "error",
    False = "false",
    If = "if",
    In = "in",
    Is = "is",
    Let = "let",
    Meta = "meta",
    Not = "not",
    Or = "or",
    Otherwise = "otherwise",
    Section = "section",
    Shared = "shared",
    Then = "then",
    True = "true",
    Try = "try",
    Type = "type",
    HashBinary = "#binary",
    HashDate = "#date",
    HashDateTime = "#datetime",
    HashDateTimeZone = "#datetimezone",
    HashDuration = "#duration",
    HashInfinity = "#infinity",
    HashNan = "#nan",
    HashSections = "#sections",
    HashShared = "#shared",
    HashTable = "#table",
    HashTime = "#time",
}

export const Keywords: ReadonlyArray<string> = [
    KeywordKind.And,
    KeywordKind.As,
    KeywordKind.Each,
    KeywordKind.Else,
    KeywordKind.Error,
    KeywordKind.False,
    KeywordKind.If,
    KeywordKind.In,
    KeywordKind.Is,
    KeywordKind.Let,
    KeywordKind.Meta,
    KeywordKind.Not,
    KeywordKind.Or,
    KeywordKind.Otherwise,
    KeywordKind.Section,
    KeywordKind.Shared,
    KeywordKind.Then,
    KeywordKind.True,
    KeywordKind.Try,
    KeywordKind.Type,
    KeywordKind.HashBinary,
    KeywordKind.HashDate,
    KeywordKind.HashDateTime,
    KeywordKind.HashDateTimeZone,
    KeywordKind.HashDuration,
    KeywordKind.HashInfinity,
    KeywordKind.HashNan,
    KeywordKind.HashSections,
    KeywordKind.HashShared,
    KeywordKind.HashTable,
    KeywordKind.HashTime,
];
