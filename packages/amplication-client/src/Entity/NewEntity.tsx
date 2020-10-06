import React, { useCallback, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";
import { Formik, Form } from "formik";
import { Snackbar } from "@rmwc/snackbar";
import { gql } from "apollo-boost";
import { HotKeys } from "react-hotkeys";

import { useMutation } from "@apollo/react-hooks";
import { pascalCase } from "pascal-case";
import { formatError } from "../util/error";
import { GET_ENTITIES } from "./EntityList";
import * as models from "../models";
import { TextField } from "../Components/TextField";
import { Button, EnumButtonStyle } from "../Components/Button";
import { generatePluralDisplayName } from "../Components/PluralDisplayNameField";
import PendingChangesContext from "../VersionControl/PendingChangesContext";
import { useTracking } from "../util/analytics";
import { validate } from "../util/formikValidateJsonSchema";
import { ReactComponent as ImageEntities } from "../assets/images/tile-entities.svg";
import "./NewEntity.scss";

type CreateEntityType = Omit<models.EntityCreateInput, "app">;

type EntityListType = {
  entities: models.Entity[];
};

type DType = {
  createOneEntity: models.Entity;
};

type Props = {
  applicationId: string;
};

const INITIAL_VALUES: CreateEntityType = {
  name: "",
  displayName: "",
  pluralDisplayName: "",
  description: "",
};

const FORM_SCHEMA = {
  required: ["displayName"],
  properties: {
    displayName: {
      type: "string",
      minLength: 2,
    },
  },
};
const CLASS_NAME = "new-entity";

const keyMap = {
  SUBMIT: ["ctrl+enter", "command+enter"],
};

const NewEntity = ({ applicationId }: Props) => {
  const { trackEvent } = useTracking();
  const pendingChangesContext = useContext(PendingChangesContext);

  const [createEntity, { error, data, loading }] = useMutation<DType>(
    CREATE_ENTITY,
    {
      onCompleted: (data) => {
        pendingChangesContext.addEntity(data.createOneEntity.id);
        trackEvent({
          eventName: "createEntity",
          entityName: data.createOneEntity.displayName,
        });
      },
      update(cache, { data }) {
        if (!data) return;

        const queryData = cache.readQuery<EntityListType>({
          query: GET_ENTITIES,
          variables: { id: applicationId },
        });
        if (queryData === null) {
          return;
        }
        cache.writeQuery({
          query: GET_ENTITIES,
          variables: { id: applicationId },
          data: {
            entities: queryData.entities.concat([data.createOneEntity]),
          },
        });
      },
    }
  );
  const history = useHistory();

  const handleSubmit = useCallback(
    (data: CreateEntityType) => {
      const displayName = data.displayName.trim();
      createEntity({
        variables: {
          data: {
            ...data,
            displayName,
            name: pascalCase(displayName),
            pluralDisplayName: generatePluralDisplayName(displayName),
            app: { connect: { id: applicationId } },
          },
        },
      }).catch(console.error);
    },
    [createEntity, applicationId]
  );

  useEffect(() => {
    if (data) {
      history.push(`/${applicationId}/entities/${data.createOneEntity.id}`);
    }
  }, [history, data, applicationId]);

  const errorMessage = formatError(error);

  return (
    <div className={CLASS_NAME}>
      <ImageEntities />
      <div className={`${CLASS_NAME}__instructions`}>
        Give your new entity a descriptive name. <br />
        For example: Customer, Support Ticket, Purchase Order...
      </div>
      <Formik
        initialValues={INITIAL_VALUES}
        validate={(values: CreateEntityType) => validate(values, FORM_SCHEMA)}
        onSubmit={handleSubmit}
        validateOnMount
      >
        {(formik) => {
          const handlers = {
            SUBMIT: formik.submitForm,
          };
          return (
            <Form>
              <HotKeys keyMap={keyMap} handlers={handlers}>
                <TextField
                  name="displayName"
                  label="New Entity Name"
                  disabled={loading}
                  autoFocus
                  hideLabel
                  placeholder="Type New Entity Name"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  buttonStyle={EnumButtonStyle.Primary}
                  disabled={!formik.isValid || loading}
                >
                  Create Entity
                </Button>
              </HotKeys>
            </Form>
          );
        }}
      </Formik>
      <Snackbar open={Boolean(error)} message={errorMessage} />
    </div>
  );
};

export default NewEntity;

const CREATE_ENTITY = gql`
  mutation createEntity($data: EntityCreateInput!) {
    createOneEntity(data: $data) {
      id
      name
      fields {
        id
        name
        dataType
      }
    }
  }
`;
