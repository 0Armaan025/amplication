import {
  findFkFieldNameOnAnnotatedField,
  handleModelNamesCollision,
} from "./schema-utils";
import { ARG_KEY_FIELD_NAME, RELATION_ATTRIBUTE_NAME } from "./constants";
import { Field, Model } from "@mrleebo/prisma-ast";
import { Mapper } from "./types";

describe("schema-utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findFkFieldNameOnAnnotatedField", () => {
    it("should throw error if no relation attribute is found", () => {
      const field = {
        type: "field",
        name: "testField",
        attributes: [
          {
            type: "attribute-type",
            kind: "kind",
            name: "attribute",
            args: [],
          },
        ],
      } as unknown as Field;

      expect(() => {
        findFkFieldNameOnAnnotatedField(field);
      }).toThrow(`Missing relation attribute on field ${field.name}`);
    });

    it("should throw error if no fields attribute is found on relation attribute", () => {
      const field = {
        name: "testField",
        attributes: [
          {
            name: RELATION_ATTRIBUTE_NAME,
            args: [],
          },
        ],
      } as unknown as Field;

      expect(() => {
        findFkFieldNameOnAnnotatedField(field);
      }).toThrow(
        `Missing fields attribute on relation attribute on field ${field.name}`
      );
    });

    it("should throw error if relation attribute has more than one field", () => {
      const field = {
        name: "testField",
        attributes: [
          {
            name: RELATION_ATTRIBUTE_NAME,
            args: [
              {
                value: {
                  key: ARG_KEY_FIELD_NAME,
                  value: { args: ["field1", "field2"] },
                },
              },
            ],
          },
        ],
      } as unknown as Field;

      expect(() => {
        findFkFieldNameOnAnnotatedField(field);
      }).toThrow(
        `Relation attribute on field ${field.name} has more than one field, which is not supported`
      );
    });

    it("should return the field name when everything is correct", () => {
      const field = {
        name: "testField",
        attributes: [
          {
            name: RELATION_ATTRIBUTE_NAME,
            args: [
              {
                value: {
                  key: ARG_KEY_FIELD_NAME,
                  value: { args: ["correctField"] },
                },
              },
            ],
          },
        ],
      } as unknown as Field;

      const result = findFkFieldNameOnAnnotatedField(field);
      expect(result).toBe("correctField");
    });
  });

  describe("handleModelNamesCollision", () => {
    const modelList = [
      { name: "Model1" },
      { name: "Model2" },
    ] as unknown as Model[];
    const existingEntities = [{ name: "Entity1" }, { name: "Entity2" }];
    const mapper = {
      modelNames: {
        name1: { newName: "NewName1" },
        name2: { newName: "NewName2" },
      },
    } as unknown as Mapper;

    it("should return the original name if there is no collision", () => {
      const result = handleModelNamesCollision(
        modelList,
        existingEntities,
        mapper,
        "OriginalName"
      );
      expect(result).toBe("OriginalName");
    });

    it("should return the name with suffix if the original name collides with model names", () => {
      const result = handleModelNamesCollision(
        modelList,
        existingEntities,
        mapper,
        "Model1"
      );
      expect(result).toBe("Model1Model");
    });

    it("should return the name with suffix if the original name collides with existing entities", () => {
      const result = handleModelNamesCollision(
        modelList,
        existingEntities,
        mapper,
        "Entity1"
      );
      expect(result).toBe("Entity1Model");
    });

    it("should return the name with suffix if the original name collides with names in the mapper", () => {
      const result = handleModelNamesCollision(
        modelList,
        existingEntities,
        mapper,
        "NewName1"
      );
      expect(result).toBe("NewName1Model");
    });
  });
});
